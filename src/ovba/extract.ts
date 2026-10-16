import * as CFB from "cfb";
import { decompressOvba } from "./compress";

interface DirModule {
  name: string;
  streamName: string;
  offset: number;
  /** 문서 모듈(ThisWorkbook·Sheet1 …)이나 클래스 모듈. 리본은 이런 모듈의 Sub를 찾지 못한다. */
  document: boolean;
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
      current = { name: decodeText(data, info.codePage), streamName: "", offset: 0, document: false };
      info.modules.push(current);
    }
    // MODULETYPE: 0x0021 표준 모듈, 0x0022 문서·클래스 모듈.
    if (current && id === 0x0022) current.document = true;
    if (current && id === 0x0047) current.name = new TextDecoder("utf-16le").decode(data);
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

export interface VbaModule {
  name: string;
  code: string;
  /** 문서·클래스 모듈이면 true. 모르면 false(표준 모듈로 본다). */
  document?: boolean;
}

/** dir 스트림 기준으로 각 모듈의 VBA 소스를 꺼낸다. dir이 없거나 깨졌으면 null. */
function moduleSources(cfb: CFB.CFB$Container): VbaModule[] | null {
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
  const sources: VbaModule[] = [];
  for (const m of info.modules) {
    const stream = vbaEntry(m.streamName);
    if (!stream || m.offset > stream.length) continue;
    try {
      sources.push({ name: m.name || m.streamName, code: decodeText(decompressOvba(stream.subarray(m.offset)), info.codePage), document: m.document });
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

/** 모든 모듈의 소스. dir을 읽지 못하면 예전 방식으로 추측하고, 그때는 모두 표준 모듈로 본다. */
function allSources(cfb: CFB.CFB$Container): VbaModule[] {
  return moduleSources(cfb) ?? guessSources(cfb).map((code, i) => ({ name: `Module${i + 1}`, code, document: false }));
}

interface ProcInfo {
  name: string;
  kind: "sub" | "function";
  isPrivate: boolean;
  params: string;
  module: string;
  document: boolean;
  /** Sub 안의 코드 줄 (주석·빈 줄 제외). */
  body: string[];
}

const PROC_RE = /^\s*(Public\s+|Private\s+|Friend\s+)?(?:Static\s+)?(Sub|Function)\s+([A-Za-z가-힣_][A-Za-z0-9가-힣_]*)\s*(?:\(([^)]*)\))?/i;
const END_RE = /^\s*End\s+(Sub|Function)\b/i;

function procedures(modules: VbaModule[]): ProcInfo[] {
  const out: ProcInfo[] = [];
  for (const mod of modules) {
    // 줄 연속(" _")은 한 줄로 합친다.
    const lines = mod.code.replace(/[ \t]_\r?\n/g, " ").split(/\r?\n/);
    let current: ProcInfo | null = null;
    for (const line of lines) {
      if (!current) {
        const m = PROC_RE.exec(line);
        if (!m) continue;
        current = {
          name: m[3],
          kind: m[2].toLowerCase() === "sub" ? "sub" : "function",
          isPrivate: /^private/i.test(m[1] ?? ""),
          params: (m[4] ?? "").replace(/\s+/g, " ").trim(),
          module: mod.name,
          document: Boolean(mod.document),
          body: [],
        };
        continue;
      }
      if (END_RE.test(line)) {
        out.push(current);
        current = null;
        continue;
      }
      const code = line.replace(/^\s+|\s+$/g, "");
      if (code && !code.startsWith("'") && !/^Rem\b/i.test(code)) current.body.push(code);
    }
    if (current) out.push(current);
  }
  return out;
}

/** 리본에서 부를 수 있는 Sub인지: 표준 모듈의 Private 아닌 Sub. */
function ribbonCallable(p: ProcInfo): boolean {
  return p.kind === "sub" && !p.isPrivate && !p.document;
}

/** 리본에서 부를 수 있는 Sub 이름 (표준 모듈의 Public Sub). */
export function extractPublicSubs(vbaProject: Uint8Array): string[] {
  const procs = procedures(allSources(CFB.parse(vbaProject)));
  const names = new Set(procs.filter(ribbonCallable).map((p) => p.name));
  return [...names].sort((a, b) => a.localeCompare(b, "en"));
}

export interface VbaAnalysis {
  /** 리본에서 부를 수 있는 Sub 이름. */
  callable: string[];
  /** Sub 이름 → 괄호 안 매개변수. */
  params: Record<string, string>;
  /** 새 모듈에 같은 이름을 만들면 "모호한 이름" 오류가 나는 이름 (표준 모듈의 Public Sub·Function, 소문자). */
  taken: string[];
  /** 엑셀에서 컴파일 오류가 나거나 리본이 매크로를 찾지 못하게 되는 문제. 학생이 엑셀에서 고쳐야 한다. */
  problems: VbaProblem[];
}

export interface VbaProblem {
  /** 문제가 된 Sub 이름. */
  name: string;
  message: string;
  /** true면 모듈 컴파일이 실패해 그 모듈의 매크로가 모두 멈춘다. false면 이 이름을 리본에서 부를 때만 실패한다. */
  compileError: boolean;
}

/** 파일 VBA를 훑어 리본 연결에 쓸 정보와, 엑셀에서 리본 매크로가 모두 멈추게 하는 흔한 실수를 찾는다. */
export function analyzeVba(vbaProject: Uint8Array): VbaAnalysis {
  const procs = procedures(allSources(CFB.parse(vbaProject)));
  const params: Record<string, string> = {};
  for (const p of procs) if (p.kind === "sub" && !(p.name in params)) params[p.name] = p.params;
  const problems: VbaProblem[] = [];

  // 같은 이름의 Sub·Function이 두 번 있으면:
  // - 한 모듈 안: "모호한 이름이 있습니다" 컴파일 오류 → 그 모듈의 매크로가 모두 멈춘다.
  // - 서로 다른 표준 모듈: 리본이 어느 쪽인지 몰라 "매크로를 실행할 수 없습니다".
  const byModule = new Map<string, number>();
  for (const p of procs) {
    const key = `${p.module.toLowerCase()}\u0000${p.name.toLowerCase()}`;
    byModule.set(key, (byModule.get(key) ?? 0) + 1);
  }
  const reported = new Set<string>();
  for (const p of procs) {
    const key = `${p.module.toLowerCase()}\u0000${p.name.toLowerCase()}`;
    if ((byModule.get(key) ?? 0) > 1 && !reported.has(key)) {
      reported.add(key);
      problems.push({
        name: p.name,
        compileError: true,
        message: `${p.module} 모듈에 "${p.name}"가 두 번 있습니다. 엑셀(Alt+F11)에서 하나를 지우세요. ("모호한 이름" 컴파일 오류로 이 모듈의 매크로가 모두 멈춥니다)`,
      });
    }
  }
  const publicStd = procs.filter((p) => !p.isPrivate && !p.document);
  const byName = new Map<string, ProcInfo[]>();
  for (const p of publicStd) byName.set(p.name.toLowerCase(), [...(byName.get(p.name.toLowerCase()) ?? []), p]);
  for (const list of byName.values()) {
    const modules = [...new Set(list.map((p) => p.module))];
    if (modules.length > 1) {
      problems.push({
        name: list[0].name,
        compileError: false,
        message: `"${list[0].name}"가 여러 모듈(${modules.join(", ")})에 있습니다. 엑셀(Alt+F11)에서 하나만 남기고 지우세요. (리본 단추가 "매크로를 실행할 수 없습니다"로 멈춥니다)`,
      });
    }
  }

  for (const p of procs) {
    // 자기 자신을 인수 없이 부르는 콜백 (예: Sub dd_Go(control …) 안에 "dd_Go" 한 줄) → "인수가 선택적이 아닙니다" 컴파일 오류.
    const selfCall = new RegExp(`^(?:Call\\s+)?${p.name}\\s*(?:\\(\\s*\\))?$`, "i");
    if (p.params && p.body.some((line) => selfCall.test(line))) {
      problems.push({
        name: p.name,
        compileError: true,
        message: `${p.module} 모듈의 "${p.name}"가 자기 자신을 부릅니다. 엑셀(Alt+F11)에서 그 줄을 지우거나, 부르려던 다른 매크로 이름으로 바꾸세요. (컴파일 오류로 이 모듈의 매크로가 모두 멈춥니다)`,
      });
    }
  }

  return {
    callable: [...new Set(procs.filter(ribbonCallable).map((p) => p.name))].sort((a, b) => a.localeCompare(b, "en")),
    params,
    taken: [...byName.keys()],
    problems,
  };
}

/** 리본이 부를 수 없는 곳(문서 모듈, Private)에만 있는 Sub 이름 → 그 이유. */
export function hiddenSubs(vbaProject: Uint8Array): Record<string, string> {
  const procs = procedures(allSources(CFB.parse(vbaProject)));
  const callable = new Set(procs.filter(ribbonCallable).map((p) => p.name.toLowerCase()));
  const out: Record<string, string> = {};
  for (const p of procs) {
    if (p.kind !== "sub" || callable.has(p.name.toLowerCase()) || p.name in out) continue;
    if (p.document) out[p.name] = `${p.module}(시트·통합 문서 모듈)에 있음`;
    else if (p.isPrivate) out[p.name] = "Private Sub임";
  }
  return out;
}

/** 각 모듈의 이름과 코드 (Attribute 줄은 뺀다). 코드가 비어 있는 문서 모듈은 건너뛴다. */
export function extractModules(vbaProject: Uint8Array): VbaModule[] {
  const cfb = CFB.parse(vbaProject);
  const modules = moduleSources(cfb) ?? guessSources(cfb).map((code, i) => ({ name: `Module${i + 1}`, code }));
  return modules
    .map((m) => ({
      name: m.name,
      code: m.code
        .split(/\r?\n/)
        .filter((line) => !/^Attribute\s+VB_/i.test(line))
        .join("\r\n")
        .replace(/^(?:\r\n)+|(?:\r\n)+$/g, ""),
    }))
    .filter((m) => m.code.trim());
}

const SUB_PARAMS_RE = /^\s*(?:Public\s+|Private\s+)?(?:Static\s+)?Sub\s+([A-Za-z가-힣_][A-Za-z0-9가-힣_]*)\s*\(([^)]*)\)/gim;

/** Sub 이름 → 괄호 안 매개변수 (줄 연속 " _" 는 한 줄로 합친다). */
export function extractSubParams(vbaProject: Uint8Array): Record<string, string> {
  const cfb = CFB.parse(vbaProject);
  const texts = moduleSources(cfb)?.map((m) => m.code) ?? guessSources(cfb);
  const out: Record<string, string> = {};
  for (const raw of texts) {
    const text = raw.replace(/[ \t]_\r?\n/g, " ");
    SUB_PARAMS_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = SUB_PARAMS_RE.exec(text))) {
      if (!(m[1] in out)) out[m[1]] = m[2].replace(/\s+/g, " ").trim();
    }
  }
  return out;
}
