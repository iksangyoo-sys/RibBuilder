import { describe, expect, it } from "vitest";
import { IdIssuer } from "./ids";
import { createControl, createCustomTab, createGroup, emptyRibbon } from "./factory";
import type { Control, RibbonDoc } from "./types";
import { validateDoc } from "./validate";

function docWith(control: Control): RibbonDoc {
  const issuer = new IdIssuer();
  const doc = emptyRibbon();
  const tab = createCustomTab(issuer, 1);
  const group = createGroup(issuer, "그룹 1");
  group.controls.push(control);
  tab.groups.push(group);
  doc.tabs.push(tab);
  return doc;
}

describe("validateDoc — 학생이 자주 하는 실수", () => {
  it("드롭다운 매크로를 getSelectedItemID 칸에만 넣으면 저장을 막는다", () => {
    const dd = createControl(new IdIssuer(), "dropDown") as Extract<Control, { type: "dropDown" }>;
    dd.getSelectedItemID = "dd_GoToWeb";
    dd.onAction = "";
    const issues = validateDoc(docWith(dd), new Set());
    expect(issues.some((i) => i.level === "error" && i.message.includes("getSelectedItemID"))).toBe(true);
  });

  it("드롭다운에 onAction이 있으면 그 오류가 없다", () => {
    const dd = createControl(new IdIssuer(), "dropDown") as Extract<Control, { type: "dropDown" }>;
    dd.onAction = "dd_GoToWeb";
    const issues = validateDoc(docWith(dd), new Set());
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
  });

  it("파일 VBA의 컴파일 오류는 저장을 막는다", () => {
    const btn = createControl(new IdIssuer(), "button") as Extract<Control, { type: "button" }>;
    btn.onAction = "btn_A";
    const issues = validateDoc(docWith(btn), new Set(), [{ name: "btn_A", source: "file" }], {
      problems: [{ name: "dd_Go", compileError: true, message: "자기 자신을 부릅니다." }],
      taken: ["btn_a"],
      hidden: {},
    });
    expect(issues.some((i) => i.level === "error" && i.message.includes("[엑셀 VBA]"))).toBe(true);
  });

  it("리본이 쓰는 이름의 중복은 오류, 쓰지 않는 이름의 중복은 경고", () => {
    const btn = createControl(new IdIssuer(), "button") as Extract<Control, { type: "button" }>;
    btn.onAction = "btn_R2";
    const vba = (name: string) => ({ problems: [{ name, compileError: false, message: "여러 모듈에 있습니다." }], taken: [], hidden: {} });
    const used = validateDoc(docWith(btn), new Set(), [{ name: "btn_R2", source: "file" }], vba("btn_R2"));
    const unused = validateDoc(docWith(btn), new Set(), [{ name: "btn_R2", source: "file" }], vba("other"));
    expect(used.find((i) => i.message.includes("[엑셀 VBA]"))?.level).toBe("error");
    expect(unused.find((i) => i.message.includes("[엑셀 VBA]"))?.level).toBe("warn");
  });

  it("같은 이름의 Function이 파일에 있으면 새 Sub를 만들지 못하게 막는다", () => {
    const btn = createControl(new IdIssuer(), "button") as Extract<Control, { type: "button" }>;
    btn.onAction = "합계";
    const issues = validateDoc(docWith(btn), new Set(), [], { problems: [], taken: ["합계"], hidden: {} });
    expect(issues.some((i) => i.level === "error" && i.message.includes("Function"))).toBe(true);
  });
});
