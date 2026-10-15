import { describe, expect, it } from "vitest";
import * as CFB from "cfb";
import { compressOvba, decompressOvba } from "./compress";
import { buildVbaProject } from "./embed";
import { extractModules, extractPublicSubs, extractSubParams } from "./extract";

describe("extractPublicSubs", () => {
  it("한국어 코드 페이지로 저장된 매크로 이름을 그대로 읽는다", () => {
    const bin = buildVbaProject("Sub btn_실행(control As IRibbonControl)\r\nEnd Sub\r\nSub btn_Save(control As IRibbonControl)\r\nEnd Sub\r\n");
    expect(extractPublicSubs(bin)).toEqual(["btn_Save", "btn_실행"]);
  });

  it("영문만 있는 프로젝트도 읽는다", () => {
    const bin = buildVbaProject("Public Sub btn_Help(control As IRibbonControl)\r\nEnd Sub\r\n");
    expect(extractPublicSubs(bin)).toEqual(["btn_Help"]);
  });

  it("엑셀이 저장한 파일처럼 소스 앞에 컴파일된 코드가 있어도 MODULEOFFSET부터 읽는다", () => {
    const cfb = CFB.read(buildVbaProject("Sub btn_실행(control As IRibbonControl)\r\nEnd Sub\r\n"), { type: "array" });
    const entry = (name: string) => cfb.FileIndex[cfb.FullPaths.findIndex((p) => p.endsWith(`/VBA/${name}`))];
    const junk = Uint8Array.from({ length: 300 }, (_, i) => (i * 37) & 0xff);
    const module = entry("RibbonCallbacks");
    const source = Uint8Array.from(module.content as ArrayLike<number>);
    const shifted = new Uint8Array(junk.length + source.length);
    shifted.set(junk);
    shifted.set(source, junk.length);
    module.content = shifted;
    module.size = shifted.length;
    // dir의 RibbonCallbacks MODULEOFFSET(0x0031)을 300으로 바꾼다.
    const dir = decompressOvba(Uint8Array.from(entry("dir").content as ArrayLike<number>));
    const view = new DataView(dir.buffer, dir.byteOffset, dir.byteLength);
    let i = 0;
    let lastOffsetAt = -1;
    while (i + 6 <= dir.length) {
      const id = view.getUint16(i, true);
      const size = id === 0x0009 ? 6 : view.getUint32(i + 2, true);
      if (id === 0x0031) lastOffsetAt = i + 6;
      if (id === 0x0010) break;
      i += 6 + size;
    }
    view.setUint32(lastOffsetAt, junk.length, true);
    const packed = compressOvba(dir);
    entry("dir").content = packed;
    entry("dir").size = packed.length;
    const bin = Uint8Array.from(CFB.write(cfb, { type: "array" }) as number[]);
    expect(extractPublicSubs(bin)).toEqual(["btn_실행"]);
  });
});

describe("extractModules", () => {
  it("모듈 이름과 코드를 Attribute 줄 없이 돌려준다", () => {
    const bin = buildVbaProject("Sub btn_실행(control As IRibbonControl)\r\n    MsgBox \"안녕\"\r\nEnd Sub\r\n");
    const modules = extractModules(bin);
    const callbacks = modules.find((m) => m.name === "RibbonCallbacks");
    expect(callbacks?.code).toContain("Sub btn_실행(control As IRibbonControl)");
    expect(callbacks?.code).toContain("MsgBox \"안녕\"");
    expect(modules.every((m) => !/Attribute\s+VB_/i.test(m.code))).toBe(true);
  });
});

describe("extractSubParams", () => {
  it("Sub마다 괄호 안 매개변수를 읽는다 (줄 연속 포함)", () => {
    const bin = buildVbaProject(
      "Sub btn_Send(control As IRibbonControl)\r\nEnd Sub\r\n" +
      "Sub LoadImage(imageID As String, ByRef image)\r\nEnd Sub\r\n" +
      "Sub 네이버메일발송()\r\nEnd Sub\r\n" +
      "Sub dd_Go(control As IRibbonControl, _\r\n    id As String, index As Integer)\r\nEnd Sub\r\n",
    );
    const params = extractSubParams(bin);
    expect(params.btn_Send).toBe("control As IRibbonControl");
    expect(params.LoadImage).toBe("imageID As String, ByRef image");
    expect(params["네이버메일발송"]).toBe("");
    expect(params.dd_Go).toBe("control As IRibbonControl, id As String, index As Integer");
  });
});
