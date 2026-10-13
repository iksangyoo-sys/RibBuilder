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

  it("드롭다운 콜백은 항목 id로 분기하고 getSelectedItemID는 첫 항목을 돌려준다", () => {
    const issuer = new IdIssuer();
    const tab = createCustomTab(issuer, 1);
    const g = createGroup(issuer);
    const dd = createControl(issuer, "dropDown");
    if (dd.type !== "dropDown") throw new Error("dropDown");
    dd.items = [{ uid: "u_a", id: "youtube", label: "유튜브" }, { uid: "u_b", id: "google", label: "구글" }];
    dd.onAction = "dd_Pick";
    dd.getSelectedItemID = "dd_First";
    g.controls.push(dd);
    tab.groups.push(g);
    const vba = generateVba({ tabs: [tab] });
    expect(vba).toContain("    Select Case id");
    expect(vba).toContain('        Case "google"');
    expect(vba).toContain("Sub dd_First(control As IRibbonControl, ByRef returnedVal)");
    expect(vba).toContain('    returnedVal = "youtube"');
  });
});
