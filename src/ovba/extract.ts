import * as CFB from "cfb";
import { decompressOvba } from "./compress";

interface DirModule {
  streamName: string;
  offset: number;
}

interface DirInfo {
  codePage: number;
  modules: DirModule[];
}

/** MS-OVBA 2.3.4.2 dir 스트림에서 코드 페이지와 모듈별 소스 위치(MODULEOFFSET)를 읽는다. */
function parseDir(dir: Uint8Array): DirInfo {
  const view = new DataView(dir.buffer, dir.byteOffset, dir.byteLength);
  const info: DirInfo = { codePage: 1252, modules: [] };
  let current: DirModule | null = null;
  let i = 0;
  while (i + 6 <= dir.length) {
    const id = view.getUint16(i, true);
    const size = view.getUint32(i + 2, true);
    i += 6;
    // PROJECTVERSION은 크기 칸(항상 4)과 달리 6바이트를 더 차지한다.
    const length = id === 0x0009 ? 6 : size;
    if (i + length > dir.length) break;
    const data = dir.subarray(i, i + length);
    if (id === 0x0003 && length >= 2) info.codePage = view.getUint16(i, true);
    if (id === 0x0019) {
      current = { streamName: "", offset: 0 };
      info.modules.push(current);
    }
    if (current && id === 0x001a && !current.streamName) current.streamName = decodeText(data, info.codePage);
    if (current && id === 0x0032) current.streamName = new TextDecoder("utf-16le").decode(data);
    if (current && id === 0x0031 && length >= 4) current.offset = view.getUint32(i, true);
    if (id === 0x0010) break;
    i += length;
  }
  return info;
}

function decoderLabel(codePage: number): string {
  switch (codePage) {
    case 949:
      return "euc-kr";
    case 932:
      return "shift_jis";
    case 936:
      return "gbk";
    case 950:
      return "big5";
    case 65001:
      return "utf-8";
    default:
      return `windows-${codePage}`;
  }
}

export function decodeText(bytes: Uint8Array, codePage: number): string {
  try {
    return new TextDecoder(decoderLabel(codePage)).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

function toBytes(content: CFB.CFB$Blob): Uint8Array {
  return content instanceof Uint8Array ? content : Uint8Array.from(content as number[]);
}

/** dir 스트림 기준으로 각 모듈의 VBA 소스를 꺼낸다. dir이 없거나 깨졌으면 null. */
function moduleSources(cfb: CFB.CFB$Container): string[] | null {
  const vbaEntry = (name: string) => {
    const index = cfb.FullPaths.findIndex((p) => /\/VBA\/[^/]+$/i.test(p) && p.split("/").pop()!.toLowerCase() === name.toLowerCase());
    const entry = index >= 0 ? cfb.FileIndex[index] : undefined;
    return entry?.content ? toBytes(entry.content) : null;
  };
  const dirStream = vbaEntry("dir");
  if (!dirStream) return null;
  let info: DirInfo;
  try {
    info = parseDir(decompressOvba(dirStream));
  } catch {
    return null;
  }
  if (!info.modules.length) return null;
  const sources: string[] = [];
  for (const m of info.modules) {
    const stream = vbaEntry(m.streamName);
    if (!stream || m.offset > stream.length) continue;
    try {
      sources.push(decodeText(decompressOvba(stream.subarray(m.offset)), info.codePage));
    } catch {
      /* 손상된 모듈은 건너뛴다 */
    }
  }
  return sources;
}

function decodeModule(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  let text = "";
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    if (c === 0) continue;
    text += String.fromCharCode(c);
  }
  return text;
}

function tryDecompress(stream: Uint8Array): Uint8Array {
  try {
    return decompressOvba(stream);
  } catch {
    try {
      return decompressOvba(stream.subarray(1));
    } catch {
      return stream;
    }
  }
}

/** dir 스트림이 없을 때 쓰는 예전 방식: 스트림 맨 앞이 소스라고 보고 읽는다. */
function guessSources(cfb: CFB.CFB$Container): string[] {
  const sources: string[] = [];
  for (const entry of cfb.FileIndex) {
    if (!entry || entry.type !== 2 || !entry.content) continue;
    if (/dir$|_VBA_PROJECT$|PROJECT/i.test(entry.name)) continue;
    const text = decodeModule(tryDecompress(toBytes(entry.content)));
    if (!/Attribute\s+VB_Name/i.test(text) && !/\bSub\s+/i.test(text)) continue;
    sources.push(text);
  }
  return sources;
}

const SUB_RE = /^\s*(?:Public\s+|Private\s+)?(?:Static\s+)?Sub\s+([A-Za-z가-힣_][A-Za-z0-9가-힣_]*)/gim;

export function extractPublicSubs(vbaProject: Uint8Array): string[] {
  const cfb = CFB.parse(vbaProject);
  const names = new Set<string>();
  for (const text of moduleSources(cfb) ?? guessSources(cfb)) {
    SUB_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = SUB_RE.exec(text))) {
      if (m[1].toLowerCase() === "class_initialize" || m[1].toLowerCase() === "class_terminate") continue;
      names.add(m[1]);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}
