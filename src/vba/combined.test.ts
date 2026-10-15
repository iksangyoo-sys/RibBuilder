import { describe, expect, it } from "vitest";
import { appendModule } from "@/ovba/append";
import { buildVbaProject } from "@/ovba/embed";
import { extractModules } from "@/ovba/extract";
import { combinedVba } from "./combined";

const ADDED = "' ====\r\n' Excel Ribbon Builder가 추가한 매크로\r\nOption Explicit\r\n\r\nSub btn_OpenSkill(control As IRibbonControl)\r\n    MsgBox \"btn_OpenSkill 호출됨\"\r\nEnd Sub\r\n";

describe("combinedVba", () => {
  it("화면에 보이는 VBA가 저장한 파일의 VBA와 똑같다", () => {
    // 한국어 엑셀처럼 한글이 있는 프로젝트(코드 페이지 949)로 만든다.
    const original = buildVbaProject("' 기존 코드\r\nSub btn_Old(control As IRibbonControl)\r\nEnd Sub\r\n", { book: "ThisWorkbook", sheets: ["Sheet1"] });
    const before = extractModules(original);
    const view = combinedVba(before, ADDED, true);

    const saved = appendModule(original, ADDED);
    if (!saved.ok) throw new Error(saved.reason);
    // 저장한 파일에서 읽은 모듈을 같은 형식으로 이어 붙이면 화면 내용과 같아야 한다 (머리말 이름만 다름).
    const after = extractModules(saved.bytes);
    const expected = after.map((m) => `' ===== ${m.name} =====\r\n${m.code}`).join("\r\n\r\n");
    expect(view.text.replace(" (저장하면 새로 추가됨)", "")).toBe(expected);
    // 이미 RibbonCallbacks가 있으므로 저장은 RibbonCallbacks2를 만들고, 화면도 같은 이름을 보여 준다.
    expect(saved.moduleName).toBe("RibbonCallbacks2");
    expect(view.text).toContain("' ===== RibbonCallbacks2 (저장하면 새로 추가됨) =====");
  });

  it("새로 더해질 줄 번호를 알려 준다", () => {
    const view = combinedVba([{ name: "Module1", code: "Sub a()\r\nEnd Sub" }], ADDED, true);
    const lines = view.text.split("\r\n");
    expect(lines[view.addedFrom]).toBe("' ===== RibbonCallbacks (저장하면 새로 추가됨) =====");
    expect(lines.slice(0, view.addedFrom).join("\r\n")).toBe("' ===== Module1 =====\r\nSub a()\r\nEnd Sub\r\n");
  });

  it("더할 코드가 없으면 기존 코드만 보여 준다", () => {
    const view = combinedVba([{ name: "Module1", code: "Sub a()\r\nEnd Sub" }], "", true);
    expect(view).toEqual({ text: "' ===== Module1 =====\r\nSub a()\r\nEnd Sub", addedFrom: -1 });
  });

  it("VBA 포함이 꺼져 있으면 직접 붙여 넣으라고 알린다", () => {
    const view = combinedVba([{ name: "Module1", code: "Sub a()\r\nEnd Sub" }], ADDED, false);
    expect(view.text).toContain("직접 붙여 넣으세요");
    expect(view.text).not.toContain("저장하면 새로 추가됨");
  });
});
