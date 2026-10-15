import { describe, expect, it } from "vitest";
import * as CFB from "cfb";
import { appendModule } from "./append";
import { compressOvba, decompressOvba } from "./compress";
import { buildVbaProject, encryptHex, isProjectLocked } from "./embed";
import { extractPublicSubs } from "./extract";

const stream = (cfb: CFB.CFB$Container, path: string) => Uint8Array.from(CFB.find(cfb, path)!.content as ArrayLike<number>);
const NEW_SUB = "Option Explicit\r\n\r\nSub btn_prompt(control As IRibbonControl)\r\n    MsgBox \"btn_prompt 호출됨\"\r\nEnd Sub\r\n";

describe("appendModule", () => {
  it("기존 모듈은 두고 새 모듈을 더한다", () => {
    const original = buildVbaProject("Sub btn_실행(control As IRibbonControl)\r\nEnd Sub\r\n", { book: "ThisWorkbook", sheets: ["Sheet1"] });
    const result = appendModule(original, NEW_SUB);
    if (!result.ok) throw new Error(result.reason);
    // 이미 RibbonCallbacks가 있으므로 겹치지 않는 이름을 고른다.
    expect(result.moduleName).toBe("RibbonCallbacks2");
    expect(extractPublicSubs(result.bytes)).toEqual(["btn_prompt", "btn_실행"]);

    const cfb = CFB.read(result.bytes, { type: "array" });
    const project = new TextDecoder("euc-kr").decode(stream(cfb, "/PROJECT"));
    expect(project).toMatch(/Module=RibbonCallbacks\r\nModule=RibbonCallbacks2\r\nName="VBAProject"/);
    expect(stream(cfb, "/VBA/_VBA_PROJECT")).toEqual(Uint8Array.from([0xcc, 0x61, 0xff, 0xff, 0, 0, 0]));
    const dir = decompressOvba(stream(cfb, "/VBA/dir"));
    // PROJECTMODULES 개수: 문서 모듈 2 + 표준 모듈 2
    const view = new DataView(dir.buffer, dir.byteOffset, dir.byteLength);
    let i = 0;
    let count = -1;
    while (i + 6 <= dir.length) {
      const id = view.getUint16(i, true);
      const size = id === 0x0009 ? 6 : view.getUint32(i + 2, true);
      if (id === 0x000f) count = view.getUint16(i + 6, true);
      if (id === 0x0010) break;
      i += 6 + size;
    }
    expect(count).toBe(4);
  });

  it("엑셀처럼 소스 앞에 컴파일된 코드가 있는 기존 모듈도 그대로 읽힌다", () => {
    const cfb = CFB.read(buildVbaProject("Sub btn_Old(control As IRibbonControl)\r\nEnd Sub\r\n"), { type: "array" });
    const module = CFB.find(cfb, "/VBA/RibbonCallbacks")!;
    const junk = Uint8Array.from({ length: 200 }, (_, n) => (n * 13) & 0xff);
    const shifted = new Uint8Array(junk.length + module.size);
    shifted.set(junk);
    shifted.set(stream(cfb, "/VBA/RibbonCallbacks"), junk.length);
    module.content = shifted;
    module.size = shifted.length;
    const dir = decompressOvba(stream(cfb, "/VBA/dir"));
    const view = new DataView(dir.buffer, dir.byteOffset, dir.byteLength);
    let i = 0;
    while (i + 6 <= dir.length) {
      const id = view.getUint16(i, true);
      const size = id === 0x0009 ? 6 : view.getUint32(i + 2, true);
      if (id === 0x0031) view.setUint32(i + 6, junk.length, true);
      if (id === 0x0010) break;
      i += 6 + size;
    }
    const packed = compressOvba(dir);
    const dirEntry = CFB.find(cfb, "/VBA/dir")!;
    dirEntry.content = packed;
    dirEntry.size = packed.length;
    const excelLike = Uint8Array.from(CFB.write(cfb, { type: "array" }) as number[]);

    const result = appendModule(excelLike, NEW_SUB);
    if (!result.ok) throw new Error(result.reason);
    expect(extractPublicSubs(result.bytes)).toEqual(["btn_Old", "btn_prompt"]);
  });

  it("암호가 걸린 프로젝트는 건드리지 않는다", () => {
    const cfb = CFB.read(buildVbaProject("Sub a()\r\nEnd Sub\r\n"), { type: "array" });
    const text = new TextDecoder("windows-1252").decode(stream(cfb, "/PROJECT"));
    const locked = text.replace(/DPB="[0-9A-F]+"/, `DPB="${encryptHex(Array.from({ length: 29 }, (_, n) => n + 1))}"`);
    expect(isProjectLocked(text)).toBe(false);
    expect(isProjectLocked(locked)).toBe(true);
    const entry = CFB.find(cfb, "/PROJECT")!;
    entry.content = Uint8Array.from(locked, (c) => c.charCodeAt(0));
    entry.size = locked.length;
    const result = appendModule(Uint8Array.from(CFB.write(cfb, { type: "array" }) as number[]), NEW_SUB);
    expect(result.ok).toBe(false);
  });

  it("엑셀이 남긴 __SRP_* 성능 캐시를 비운다 (남기면 엑셀이 열다가 강제 종료된다)", () => {
    const cfb = CFB.read(buildVbaProject("Sub btn_Old(control As IRibbonControl)\r\nEnd Sub\r\n"), { type: "array" });
    for (const name of ["__SRP_0", "__SRP_1", "__SRP_a"]) CFB.utils.cfb_add(cfb, `/VBA/${name}`, Uint8Array.from([1, 2, 3, 4]));
    const withSrp = Uint8Array.from(CFB.write(cfb, { type: "array" }) as number[]);
    const result = appendModule(withSrp, NEW_SUB);
    if (!result.ok) throw new Error(result.reason);
    const out = CFB.read(result.bytes, { type: "array" });
    const srp = out.FullPaths.map((p, i) => ({ p, e: out.FileIndex[i] })).filter(({ p }) => /\/__SRP_[0-9a-f]+$/i.test(p));
    expect(srp.length).toBe(3);
    for (const { e } of srp) expect(e.size).toBe(0);
    expect(extractPublicSubs(result.bytes)).toEqual(["btn_Old", "btn_prompt"]);
  });
});
