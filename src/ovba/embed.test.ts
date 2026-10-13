import { describe, expect, it } from "vitest";
import * as CFB from "cfb";
import { compressOvba, decompressOvba } from "./compress";
import { buildVbaProject } from "./embed";

function stream(cfb: CFB.CFB$Container, path: string): Uint8Array {
  const entry = CFB.find(cfb, path);
  if (!entry?.content) throw new Error(`${path} 없음`);
  return Uint8Array.from(entry.content as ArrayLike<number>);
}

describe("compressOvba", () => {
  it("압축 후 풀면 원문과 같다", () => {
    const text = "Attribute VB_Name = \"RibbonCallbacks\"\r\n" + "Sub btn_Click(control As IRibbonControl)\r\n    MsgBox \"hi\"\r\nEnd Sub\r\n".repeat(200);
    const plain = new TextEncoder().encode(text);
    const packed = compressOvba(plain);
    expect(packed.length).toBeLessThan(plain.length);
    expect(decompressOvba(packed)).toEqual(plain);
  });

  it("반복이 없는 데이터와 빈 데이터도 되돌린다", () => {
    const noise = Uint8Array.from({ length: 9000 }, (_, i) => (i * 7919 + (i >> 3) * 31) & 0xff);
    expect(decompressOvba(compressOvba(noise))).toEqual(noise);
    expect(decompressOvba(compressOvba(new Uint8Array()))).toEqual(new Uint8Array());
  });
});

describe("buildVbaProject", () => {
  it("문서 모듈과 콜백 모듈, dir·PROJECT 스트림을 만든다", () => {
    const bin = buildVbaProject("Option Explicit\r\nSub btn_실행(control As IRibbonControl)\r\nEnd Sub\r\n", { book: "ThisWorkbook", sheets: ["Sheet1"] });
    const cfb = CFB.read(bin, { type: "array" });
    const project = new TextDecoder("euc-kr").decode(stream(cfb, "/PROJECT"));
    expect(project).toContain("Document=ThisWorkbook/&H00000000");
    expect(project).toContain("Document=Sheet1/&H00000000");
    expect(project).toContain("Module=RibbonCallbacks");
    expect(project).toMatch(/CMG="[0-9A-F]+"/);
    expect(stream(cfb, "/VBA/_VBA_PROJECT")).toEqual(Uint8Array.from([0xcc, 0x61, 0xff, 0xff, 0, 0, 0]));
    const dir = decompressOvba(stream(cfb, "/VBA/dir"));
    expect(dir[0] | (dir[1] << 8)).toBe(0x0001);
    const module = new TextDecoder("euc-kr").decode(decompressOvba(stream(cfb, "/VBA/RibbonCallbacks")));
    expect(module).toContain('Attribute VB_Name = "RibbonCallbacks"');
    expect(module).toContain("Sub btn_실행(control As IRibbonControl)");
  });
});
