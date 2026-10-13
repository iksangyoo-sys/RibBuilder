import { describe, expect, it } from "vitest";
import * as CFB from "cfb";
import { compressOvba, decompressOvba } from "./compress";
import { buildVbaProject } from "./embed";
import { extractPublicSubs } from "./extract";

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
