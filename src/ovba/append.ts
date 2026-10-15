import * as CFB from "cfb";
import { compressOvba, decompressOvba } from "./compress";
import { encodeVbaText, isProjectLocked } from "./embed";
import { decodeText as decodeVbaText } from "./extract";

/**
 * 엑셀이 저장한 vbaProject.bin에 표준 모듈 하나를 더한다. 기존 모듈과 코드는 그대로 둔다.
 *
 * - dir 스트림에 모듈 레코드를 덧붙이고 PROJECT·PROJECTwm에도 이름을 더한다.
 * - _VBA_PROJECT를 버전 0xFFFF 머리말로 바꾸고 __SRP_* 캐시를 비워, 엑셀이 저장된 컴파일 캐시 대신
 *   각 모듈의 소스로 다시 컴파일하게 한다.
 */

export type AppendResult =
  | { ok: true; bytes: Uint8Array; moduleName: string }
  | { ok: false; reason: string };

interface DirRecord {
  id: number;
  /** 레코드 전체 바이트 (id·크기 포함). */
  raw: Uint8Array;
  data: Uint8Array;
}

function readDir(dir: Uint8Array): DirRecord[] {
  const view = new DataView(dir.buffer, dir.byteOffset, dir.byteLength);
  const records: DirRecord[] = [];
  let i = 0;
  while (i + 6 <= dir.length) {
    const id = view.getUint16(i, true);
    const size = view.getUint32(i + 2, true);
    // PROJECTVERSION은 크기 칸(항상 4)과 달리 6바이트를 더 차지한다.
    const length = id === 0x0009 ? 6 : size;
    if (i + 6 + length > dir.length) throw new Error("dir 스트림이 잘렸습니다.");
    records.push({ id, raw: dir.subarray(i, i + 6 + length), data: dir.subarray(i + 6, i + 6 + length) });
    i += 6 + length;
    if (id === 0x0010) break;
  }
  if (!records.length || records[records.length - 1].id !== 0x0010) throw new Error("dir 스트림 끝을 찾지 못했습니다.");
  return records;
}

function record(id: number, data: ArrayLike<number>): number[] {
  const out = [id & 0xff, id >> 8, data.length & 0xff, (data.length >> 8) & 0xff, (data.length >> 16) & 0xff, (data.length >>> 24) & 0xff];
  for (let i = 0; i < data.length; i++) out.push(data[i]);
  return out;
}

function utf16(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) out.push(text.charCodeAt(i) & 0xff, text.charCodeAt(i) >> 8);
  return out;
}

function moduleRecords(name: string, codePage: number): number[] {
  const mbcs = Array.from(encodeVbaText(name, codePage));
  return [
    ...record(0x0019, mbcs), // MODULENAME
    ...record(0x0047, utf16(name)),
    ...record(0x001a, mbcs), // MODULESTREAMNAME
    ...record(0x0032, utf16(name)),
    ...record(0x001c, []), // MODULEDOCSTRING
    ...record(0x0048, []),
    ...record(0x0031, [0, 0, 0, 0]), // MODULEOFFSET: 소스가 스트림 맨 앞
    ...record(0x001e, [0, 0, 0, 0]), // MODULEHELPCONTEXT
    ...record(0x002c, [0xff, 0xff]), // MODULECOOKIE
    0x21, 0x00, 0, 0, 0, 0, // MODULETYPE: 표준 모듈
    0x2b, 0x00, 0, 0, 0, 0, // 모듈 종료
  ];
}

function entryBytes(cfb: CFB.CFB$Container, path: string): Uint8Array | null {
  const entry = CFB.find(cfb, path);
  if (!entry?.content) return null;
  return entry.content instanceof Uint8Array ? entry.content : Uint8Array.from(entry.content as number[]);
}

function setEntry(cfb: CFB.CFB$Container, path: string, bytes: Uint8Array): void {
  const entry = CFB.find(cfb, path);
  if (entry) {
    entry.content = bytes;
    entry.size = bytes.length;
  } else {
    CFB.utils.cfb_add(cfb, path, bytes);
  }
}

/** 기존 프로젝트에 없는 이름으로 모듈 이름을 정한다 (RibbonCallbacks, RibbonCallbacks2 …). */
export function freeModuleName(taken: Set<string>, base: string): string {
  let name = base;
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base}${n}`;
  return name;
}

export function appendModule(vbaProject: Uint8Array, source: string, baseName = "RibbonCallbacks"): AppendResult {
  let cfb: CFB.CFB$Container;
  try {
    cfb = CFB.read(vbaProject, { type: "array" });
  } catch {
    return { ok: false, reason: "VBA 프로젝트를 읽지 못했습니다." };
  }
  const project = entryBytes(cfb, "/PROJECT");
  const dirStream = entryBytes(cfb, "/VBA/dir");
  const wm = entryBytes(cfb, "/PROJECTwm");
  if (!project || !dirStream) return { ok: false, reason: "VBA 프로젝트 구조가 예상과 다릅니다." };

  let records: DirRecord[];
  try {
    records = readDir(decompressOvba(dirStream));
  } catch {
    return { ok: false, reason: "VBA 프로젝트의 모듈 목록(dir)을 읽지 못했습니다." };
  }
  const codePageRec = records.find((r) => r.id === 0x0003);
  const codePage = codePageRec && codePageRec.data.length >= 2 ? codePageRec.data[0] | (codePageRec.data[1] << 8) : 1252;
  const projectText = decodeVbaText(project, codePage);
  if (isProjectLocked(projectText)) return { ok: false, reason: "VBA 프로젝트에 암호가 걸려 있어 모듈을 더할 수 없습니다." };

  const countIndex = records.findIndex((r) => r.id === 0x000f);
  if (countIndex < 0) return { ok: false, reason: "VBA 프로젝트의 모듈 수를 찾지 못했습니다." };
  const taken = new Set<string>();
  for (const r of records) if (r.id === 0x0019 || r.id === 0x001a) taken.add(decodeVbaText(r.data, codePage).toLowerCase());
  for (const p of cfb.FullPaths) taken.add((p.split("/").filter(Boolean).pop() ?? "").toLowerCase());
  const name = freeModuleName(taken, baseName);

  // dir: 모듈 수 +1, 마지막 모듈 뒤(끝 레코드 앞)에 새 모듈 레코드를 넣는다.
  const count = records[countIndex].data[0] | (records[countIndex].data[1] << 8);
  const out: number[] = [];
  records.forEach((r, i) => {
    if (i === countIndex) out.push(...record(0x000f, [(count + 1) & 0xff, (count + 1) >> 8]));
    else if (r.id === 0x0010) out.push(...moduleRecords(name, codePage), ...r.raw);
    else out.push(...r.raw);
  });
  setEntry(cfb, "/VBA/dir", compressOvba(Uint8Array.from(out)));

  // 모듈 소스 (MODULEOFFSET 0이라 압축된 소스만 둔다).
  const moduleText = `Attribute VB_Name = "${name}"\r\n${source.replace(/\r?\n/g, "\r\n")}`;
  CFB.utils.cfb_add(cfb, `/VBA/${name}`, compressOvba(encodeVbaText(moduleText, codePage)));

  // PROJECT: Name= 줄 앞에 Module= 줄을 넣는다.
  const lines = projectText.split(/\r\n/);
  const at = lines.findIndex((l) => /^Name=/i.test(l));
  lines.splice(at < 0 ? 1 : at, 0, `Module=${name}`);
  setEntry(cfb, "/PROJECT", encodeVbaText(lines.join("\r\n"), codePage));

  // PROJECTwm: 끝 표시(0x0000) 앞에 이름 쌍을 더한다.
  if (wm) {
    const body = wm.length >= 2 && wm[wm.length - 1] === 0 && wm[wm.length - 2] === 0 ? wm.subarray(0, wm.length - 2) : wm;
    const pair = [...encodeVbaText(name, codePage), 0, ...utf16(name), 0, 0];
    setEntry(cfb, "/PROJECTwm", Uint8Array.from([...body, ...pair, 0, 0]));
  }

  // 컴파일 캐시를 무효로 해서 엑셀이 소스로 다시 컴파일하게 한다.
  setEntry(cfb, "/VBA/_VBA_PROJECT", Uint8Array.from([0xcc, 0x61, 0xff, 0xff, 0x00, 0x00, 0x00]));
  // __SRP_* 는 위 캐시와 짝을 이루는 성능 캐시다. _VBA_PROJECT만 무효로 하고 이것을 남기면
  // 엑셀(VBE7.DLL)이 파일을 여는 순간 강제 종료된다. 스트림은 지우지 않고 비운다
  // (cfb 라이브러리로 지우면 컨테이너가 깨진다).
  cfb.FileIndex.forEach((entry, i) => {
    if (entry.type === 2 && /\/__SRP_[0-9a-f]+$/i.test(cfb.FullPaths[i])) {
      entry.content = new Uint8Array(0);
      entry.size = 0;
    }
  });

  return { ok: true, bytes: Uint8Array.from(CFB.write(cfb, { type: "array" }) as number[]), moduleName: name };
}
