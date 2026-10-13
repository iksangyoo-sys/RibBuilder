import { describe, expect, it } from "vitest";
import { createControl, createCustomTab, createGroup } from "@/model/factory";
import { IdIssuer } from "@/model/ids";
import { generateVba } from "./generate";

describe("generateVba", () => {
  it("컨트롤 종류별 서명을 구분한다", () => {
    const issuer = new IdIssuer();
    const tab = createCustomTab(issuer, 1);
    const g = createGroup(issuer);
    const tgl = createControl(issuer, "toggleButton");
    if (tgl.type === "toggleButton") tgl.onAction = "tgl_Click";
    const edt = createControl(issuer, "editBox");
    if (edt.type === "editBox") edt.onChange = "edt_Change";
    const dd = createControl(issuer, "dropDown");
    if (dd.type === "dropDown") dd.onAction = "dd_Pick";
    g.controls.push(tgl, edt, dd);
    tab.groups.push(g);
    const vba = generateVba({ tabs: [tab] });
    expect(vba).toContain("Sub tgl_Click(control As IRibbonControl, pressed As Boolean)");
    expect(vba).toContain("Sub edt_Change(control As IRibbonControl, text As String)");
    expect(vba).toContain("Sub dd_Pick(control As IRibbonControl, id As String, index As Integer)");
  });
});
