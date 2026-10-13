import * as CFB from "cfb";
import { compressOvba } from "./compress";

/** MS-OVBA 형식의 vbaProject.bin을 처음부터 만든다. */

const PROJECT_ID = "{5DD90D76-4904-47A2-AF0D-D69B4673604E}";

const DOC_ATTRS = [
  "Attribute VB_GlobalNameSpace = False",
  "Attribute VB_Creatable = False",
  "Attribute VB_PredeclaredId = True",
  "Attribute VB_Exposed = True",
  "Attribute VB_TemplateDerived = False",
  "Attribute VB_Customizable = True",
];

const REFERENCES: [string, string][] = [
  ["stdole", "*\\G{00020430-0000-0000-C000-000000000046}#2.0#0#C:\\Windows\\System32\\stdole2.tlb#OLE Automation"],
  [
    "Office",
    "*\\G{2DF8D04C-5BFA-101B-BDE5-00AA0044DE52}#2.0#0#C:\\Program Files\\Common Files\\Microsoft Shared\\OFFICE16\\MSO.DLL#Microsoft Office 16.0 Object Library",
  ],
];

interface VbaModule {
  name: string;
  document: boolean;
  source: string;
}

export interface VbaHost {
  /** 통합 문서의 codeName (workbookPr codeName). */
  book: string;
  /** 워크시트 codeName 목록. */
  sheets: string[];
}

export function canEmbedIntoExisting(): boolean {
  return false;
}

let cp949: Map<string, [number, number]> | null = null;

/** 브라우저에는 CP949 인코더가 없어 EUC-KR 디코더로 역표를 만든다. */
function cp949Table(): Map<string, [number, number]> {
  if (cp949) return cp949;
  cp949 = new Map();
  const decoder = new TextDecoder("euc-kr");
  for (let lead = 0x81; lead <= 0xfe; lead++) {
    for (let trail = 0x41; trail <= 0xfe; trail++) {
      const ch = decoder.decode(new Uint8Array([lead, trail]));
      if (ch.length === 1 && ch !== "\ufffd" && !cp949.has(ch)) cp949.set(ch, [lead, trail]);
    }
  }
  return cp949;
}

function encode(text: string, codePage: number): Uint8Array {
  const out: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code < 0x80) out.push(code);
    else if (codePage === 949) {
      const pair = cp949Table().get(ch);
      if (pair) out.push(pair[0], pair[1]);
      else out.push(0x3f);
    } else out.push(code <= 0xff ? code : 0x3f);
  }
  return Uint8Array.from(out);
}

function utf16(text: string): Uint8Array {
  const out = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    out[i * 2] = c & 0xff;
    out[i * 2 + 1] = c >> 8;
  }
  return out;
}

class Writer {
  private bytes: number[] = [];
  u16(v: number): void {
    this.bytes.push(v & 0xff, (v >> 8) & 0xff);
  }
  u32(v: number): void {
    this.bytes.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
  }
  raw(data: ArrayLike<number>): void {
    for (let i = 0; i < data.length; i++) this.bytes.push(data[i]);
  }
  record(id: number, data: ArrayLike<number>): void {
    this.u16(id);
    this.u32(data.length);
    this.raw(data);
  }
  out(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

/** MS-OVBA 2.3.4.2 dir 스트림 (압축 전). */
function dirStream(modules: VbaModule[], codePage: number): Uint8Array {
  const w = new Writer();
  const mbcs = (s: string) => encode(s, codePage);
  w.record(0x0001, [1, 0, 0, 0]); // PROJECTSYSKIND: Win32
  w.record(0x0002, [0x09, 0x04, 0, 0]); // PROJECTLCID
  w.record(0x0014, [0x09, 0x04, 0, 0]); // PROJECTLCIDINVOKE
  w.record(0x0003, [codePage & 0xff, codePage >> 8]); // PROJECTCODEPAGE
  w.record(0x0004, mbcs("VBAProject")); // PROJECTNAME
  w.record(0x0005, []); // PROJECTDOCSTRING
  w.record(0x0040, []);
  w.record(0x0006, []); // PROJECTHELPFILEPATH
  w.record(0x003d, []);
  w.record(0x0007, [0, 0, 0, 0]); // PROJECTHELPCONTEXT
  w.record(0x0008, [0, 0, 0, 0]); // PROJECTLIBFLAGS
  w.u16(0x0009); // PROJECTVERSION
  w.u32(4);
  w.u32(1);
  w.u16(0);
  w.record(0x000c, []); // PROJECTCONSTANTS
  w.record(0x003c, []);
  for (const [name, libid] of REFERENCES) {
    w.record(0x0016, mbcs(name)); // REFERENCENAME
    w.record(0x003e, utf16(name));
    const lib = mbcs(libid);
    w.u16(0x000d); // REFERENCEREGISTERED
    w.u32(lib.length + 10);
    w.u32(lib.length);
    w.raw(lib);
    w.u32(0);
    w.u16(0);
  }
  w.record(0x000f, [modules.length & 0xff, modules.length >> 8]); // PROJECTMODULES
  w.record(0x0013, [0xff, 0xff]); // PROJECTCOOKIE
  for (const m of modules) {
    w.record(0x0019, mbcs(m.name)); // MODULENAME
    w.record(0x0047, utf16(m.name));
    w.record(0x001a, mbcs(m.name)); // MODULESTREAMNAME
    w.record(0x0032, utf16(m.name));
    w.record(0x001c, []); // MODULEDOCSTRING
    w.record(0x0048, []);
    w.record(0x0031, [0, 0, 0, 0]); // MODULEOFFSET: 소스가 스트림 맨 앞
    w.record(0x001e, [0, 0, 0, 0]); // MODULEHELPCONTEXT
    w.record(0x002c, [0xff, 0xff]); // MODULECOOKIE
    w.u16(m.document ? 0x0022 : 0x0021); // MODULETYPE: 문서 / 표준
    w.u32(0);
    w.u16(0x002b); // 모듈 종료
    w.u32(0);
  }
  w.u16(0x0010); // dir 종료
  w.u32(0);
  return w.out();
}

/** MS-OVBA 2.4.3 데이터 암호화 (CMG/DPB/GC 값). */
function encryptHex(data: number[]): string {
  let projKey = 0;
  for (const ch of PROJECT_ID) projKey = (projKey + ch.charCodeAt(0)) & 0xff;
  const seed = Math.floor(Math.random() * 256);
  const out = [seed, seed ^ 2, seed ^ projKey];
  let unencrypted1 = projKey;
  let encrypted1 = seed ^ projKey;
  let encrypted2 = seed ^ 2;
  const put = (b: number) => {
    const enc = (b ^ ((encrypted2 + unencrypted1) & 0xff)) & 0xff;
    out.push(enc);
    encrypted2 = encrypted1;
    encrypted1 = enc;
    unencrypted1 = b;
  };
  const ignored = (seed & 6) / 2;
  for (let i = 0; i < ignored; i++) put(7);
  const len = data.length;
  [len & 0xff, (len >> 8) & 0xff, (len >> 16) & 0xff, (len >>> 24) & 0xff].forEach(put);
  data.forEach(put);
  return out.map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join("");
}

function documentModule(name: string, base: string): VbaModule {
  const source = [`Attribute VB_Name = "${name}"`, `Attribute VB_Base = "0${base}"`, ...DOC_ATTRS].join("\r\n") + "\r\n";
  return { name, document: true, source };
}

/** 리본 콜백 모듈(RibbonCallbacks)과 통합 문서·시트 문서 모듈을 담은 vbaProject.bin. */
export function buildVbaProject(source: string, host: VbaHost = { book: "ThisWorkbook", sheets: [] }): Uint8Array {
  const modules: VbaModule[] = [
    documentModule(host.book, "{00020819-0000-0000-C000-000000000046}"),
    ...host.sheets.map((s) => documentModule(s, "{00020820-0000-0000-C000-000000000046}")),
    { name: "RibbonCallbacks", document: false, source: `Attribute VB_Name = "RibbonCallbacks"\r\n${source.replace(/\r?\n/g, "\r\n")}` },
  ];
  // 한글이 있으면 한국어 코드 페이지(949)로 저장한다.
  const codePage = modules.some((m) => /[^\x00-\x7f]/.test(m.source + m.name)) ? 949 : 1252;

  const project = [
    `ID="${PROJECT_ID}"`,
    ...modules.map((m) => (m.document ? `Document=${m.name}/&H00000000` : `Module=${m.name}`)),
    'Name="VBAProject"',
    'HelpContextID="0"',
    'VersionCompatible32="393222000"',
    `CMG="${encryptHex([0, 0, 0, 0])}"`,
    `DPB="${encryptHex([0])}"`,
    `GC="${encryptHex([0xff])}"`,
    "",
    "[Host Extender Info]",
    "&H00000001={3832D640-CF90-11CF-8E43-00A0C911005A};VBE;&H00000000",
    "",
  ].join("\r\n");

  const nameMap: number[] = [];
  for (const m of modules) {
    nameMap.push(...encode(m.name, codePage), 0);
    nameMap.push(...utf16(m.name), 0, 0);
  }
  nameMap.push(0, 0);

  const cfb = CFB.utils.cfb_new();
  CFB.utils.cfb_add(cfb, "PROJECT", encode(project, codePage));
  CFB.utils.cfb_add(cfb, "PROJECTwm", Uint8Array.from(nameMap));
  // 버전 0xFFFF: 성능 캐시가 없으니 엑셀이 소스에서 다시 컴파일한다.
  CFB.utils.cfb_add(cfb, "VBA/_VBA_PROJECT", Uint8Array.from([0xcc, 0x61, 0xff, 0xff, 0x00, 0x00, 0x00]));
  CFB.utils.cfb_add(cfb, "VBA/dir", compressOvba(dirStream(modules, codePage)));
  for (const m of modules) CFB.utils.cfb_add(cfb, `VBA/${m.name}`, compressOvba(encode(m.source, codePage)));
  return Uint8Array.from(CFB.write(cfb, { type: "array" }) as number[]);
}
