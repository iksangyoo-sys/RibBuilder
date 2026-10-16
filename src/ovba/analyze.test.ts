import { describe, expect, it } from "vitest";
import { appendModule } from "./append";
import { buildVbaProject } from "./embed";
import { analyzeVba, extractPublicSubs, hiddenSubs } from "./extract";

describe("analyzeVba", () => {
  it("콜백이 자기 자신을 인수 없이 부르면 컴파일 오류로 알려 준다", () => {
    const bin = buildVbaProject("Sub dd_GoToWeb(control As IRibbonControl, ByRef returnedVal)\r\n    dd_GoToWeb\r\nEnd Sub\r\n");
    const { problems } = analyzeVba(bin);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ name: "dd_GoToWeb", compileError: true });
  });

  it("다른 매크로를 부르는 콜백은 문제가 아니다", () => {
    const bin = buildVbaProject("Sub btn_MergeFile(control As IRibbonControl)\r\n    폴더내엑셀파일취합\r\nEnd Sub\r\nSub 폴더내엑셀파일취합()\r\nEnd Sub\r\n");
    expect(analyzeVba(bin).problems).toEqual([]);
  });

  it("같은 이름의 Sub가 두 모듈에 있으면 알려 준다", () => {
    const base = buildVbaProject("Sub btn_R2(control As IRibbonControl)\r\n    MsgBox \"a\"\r\nEnd Sub\r\n");
    const added = appendModule(base, "Sub btn_R2(control As IRibbonControl)\r\n    MsgBox \"b\"\r\nEnd Sub\r\n", "Module1");
    if (!added.ok) throw new Error(added.reason);
    const { problems } = analyzeVba(added.bytes);
    expect(problems.map((p) => [p.name, p.compileError])).toEqual([["btn_R2", false]]);
  });

  it("같은 모듈에 같은 이름이 두 번 있으면 컴파일 오류로 알려 준다", () => {
    const bin = buildVbaProject("Sub btn_A(control As IRibbonControl)\r\nEnd Sub\r\nSub btn_A(control As IRibbonControl)\r\nEnd Sub\r\n");
    expect(analyzeVba(bin).problems).toEqual([expect.objectContaining({ name: "btn_A", compileError: true })]);
  });

  it("Private Sub와 시트 모듈의 Sub는 리본에서 부를 수 없는 것으로 본다", () => {
    const base = buildVbaProject("Private Sub btn_Hidden(control As IRibbonControl)\r\nEnd Sub\r\nSub btn_Ok(control As IRibbonControl)\r\nEnd Sub\r\n");
    expect(extractPublicSubs(base)).toEqual(["btn_Ok"]);
    expect(hiddenSubs(base)).toEqual({ btn_Hidden: "Private Sub임" });
  });

  it("Function 이름도 이미 쓰인 이름으로 센다", () => {
    const bin = buildVbaProject("Function 합계(a As Long) As Long\r\nEnd Function\r\n");
    expect(analyzeVba(bin).taken).toContain("합계");
    expect(analyzeVba(bin).callable).toEqual([]);
  });
});
