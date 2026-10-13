import { describe, expect, it } from "vitest";
import { createBuiltinGroup, createControl, createCustomTab, createGroup } from "@/model/factory";
import { IdIssuer } from "@/model/ids";
import type { ControlType, RibbonDoc } from "@/model/types";
import { generateVba } from "@/vba/generate";
import { generateCustomUi } from "./generate";
import { parseCustomUi } from "./parse";

const ALL: ControlType[] = [
  "button",
  "toggleButton",
  "checkBox",
  "editBox",
  "comboBox",
  "dropDown",
  "menu",
  "splitButton",
  "labelControl",
  "separator",
];

function fullDoc(): RibbonDoc {
  const issuer = new IdIssuer();
  const tab = createCustomTab(issuer, 1);
  tab.label = "사용자";
  tab.insertAfterMso = "TabHome";
  const g1 = createGroup(issuer, "모두");
  for (const type of ALL) {
    const c = createControl(issuer, type);
    if (c.type === "button") {
      c.label = '버튼&<테스트>';
      c.screentip = '안내 "바로"';
      c.onAction = "btn_ChatGPT";
      c.imageMso = "FileSave";
    }
    if (c.type === "menu") {
      const child = createControl(issuer, "button");
      if (child.type === "button") {
        child.label = "메뉴항목";
        child.onAction = "mnu_Go";
        c.items.push(child);
      }
    }
    g1.controls.push(c);
  }
  const g2 = createBuiltinGroup(issuer, "GroupCode");
  tab.groups.push(g1, g2);
  const home = {
    kind: "builtin" as const,
    uid: issuer.uid(),
    idMso: "TabHome",
    label: "홈",
    visible: true,
    groups: [createGroup(issuer, "검사용")],
  };
  if (home.groups[0].kind === "custom") {
    const b = createControl(issuer, "button");
    if (b.type === "button") {
      b.label = "실행";
      b.onAction = "btn_ChatGPT";
    }
    home.groups[0].controls.push(b);
  }
  return { tabs: [tab, home] };
}

describe("generateCustomUi", () => {
  it("Office 2010 네임스페이스와 자기 닫힘 내장 그룹을 쓴다", () => {
    const xml = generateCustomUi(fullDoc());
    expect(xml).toContain('xmlns="http://schemas.microsoft.com/office/2009/07/customui"');
    expect(xml).toContain('<group idMso="GroupCode"/>');
    expect(xml).toContain('idMso="TabHome"');
    expect(xml).toContain('insertAfterMso="TabHome"');
    expect(xml).toContain("&amp;");
    expect(xml).toContain("&lt;");
    expect(xml).toContain("&quot;");
  });

  it("10종 컨트롤을 모두 출력한다", () => {
    const xml = generateCustomUi(fullDoc());
    for (const tag of ["button", "toggleButton", "checkBox", "editBox", "comboBox", "dropDown", "menu", "splitButton", "labelControl", "separator"]) {
      expect(xml).toContain(`<${tag}`);
    }
  });

  it("버튼 콜백 VBA 서명을 정확히 만든다", () => {
    const doc = fullDoc();
    const vba = generateVba(doc);
    expect(vba).toContain("Sub btn_ChatGPT(control As IRibbonControl)");
    expect(vba).toContain("Select Case control.ID");
    expect(vba).toContain('MsgBox "btn_ChatGPT 호출됨 (btn_6)"');
    expect(vba.match(/Sub btn_ChatGPT\(/g)?.length).toBe(1);
  });

  it("빈 기본 탭은 XML에 쓰지 않는다", () => {
    const xml = generateCustomUi({ tabs: [{
      kind: "builtin", uid: "u1", idMso: "TabHome", label: "홈", visible: true, groups: [],
    }] });
    expect(xml).not.toContain("TabHome");
  });

  it("알 수 없는 요소를 왕복 보존한다", () => {
    const xml = `<?xml version="1.0"?><customUI xmlns="http://schemas.microsoft.com/office/2009/07/customui"><ribbon><tabs><tab id="tabX" label="X"><group id="g1" label="G"><gallery id="gal1" label="갤"/></group></tab></tabs></ribbon></customUI>`;
    const parsed = parseCustomUi(xml);
    const g = parsed.doc.tabs[0].groups[0];
    expect(g.kind).toBe("custom");
    if (g.kind !== "custom") return;
    expect(g.controls[0].type).toBe("unknown");
    expect(generateCustomUi(parsed.doc)).toContain("gallery");
  });

  it("저장한 XML을 다시 읽으면 같은 구조가 된다", () => {
    const doc = fullDoc();
    const xml = generateCustomUi(doc);
    const parsed = parseCustomUi(xml);
    expect(parsed.doc.tabs).toHaveLength(2);
    expect(parsed.doc.tabs[0].kind).toBe("custom");
    expect(parsed.doc.tabs[1].kind).toBe("builtin");
    const custom = parsed.doc.tabs[0];
    expect(custom.groups[1]).toMatchObject({ kind: "builtin", idMso: "GroupCode" });
    const group = custom.groups[0];
    expect(group.kind).toBe("custom");
    if (group.kind !== "custom") return;
    expect(group.controls.map((c) => c.type)).toEqual(ALL);
    const btn = group.controls[0];
    expect(btn.type).toBe("button");
    if (btn.type === "button") {
      expect(btn.label).toBe("버튼&<테스트>");
      expect(btn.onAction).toBe("btn_ChatGPT");
    }
  });
});
