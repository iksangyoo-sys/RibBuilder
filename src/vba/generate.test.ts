import { describe, expect, it } from "vitest";
import { createControl, createCustomTab, createGroup } from "@/model/factory";
import { IdIssuer } from "@/model/ids";
import { generateVba, signatureClash, signatureConflicts } from "./generate";
import { validateDoc } from "@/model/validate";

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

  it("연결된 매크로가 모두 파일에 있으면 그렇다고 알려 준다", () => {
    const issuer = new IdIssuer();
    const tab = createCustomTab(issuer, 1);
    const g = createGroup(issuer);
    const btn = createControl(issuer, "button");
    if (btn.type === "button") btn.onAction = "btn_메일발송";
    g.controls.push(btn);
    tab.groups.push(g);
    const vba = generateVba({ tabs: [tab] }, [{ name: "btn_메일발송", source: "file" }]);
    expect(vba).toContain("이미 있습니다");
    expect(vba).not.toContain("Sub btn_메일발송");
  });

  it("버튼과 드롭다운이 같은 매크로를 쓰면 충돌로 잡고 저장 전 확인에서 오류로 막는다", () => {
    const issuer = new IdIssuer();
    const tab = createCustomTab(issuer, 1);
    const g = createGroup(issuer);
    const btn = createControl(issuer, "button");
    const dd = createControl(issuer, "dropDown");
    const tgl = createControl(issuer, "toggleButton");
    if (btn.type !== "button" || dd.type !== "dropDown" || tgl.type !== "toggleButton") throw new Error("type");
    btn.label = "ChatGPT바로가기";
    btn.onAction = "btn_OpenChatGPT";
    dd.label = "폴더바로가기";
    dd.onAction = "btn_OpenChatGPT";
    // getPressed와 getSelectedItemID는 서명이 같아 함께 써도 된다.
    tgl.getPressed = "get_Init";
    dd.getSelectedItemID = "get_Init";
    g.controls.push(btn, dd, tgl);
    tab.groups.push(g);
    const doc = { tabs: [tab] };

    expect(signatureConflicts(doc).map((c) => c.name)).toEqual(["btn_OpenChatGPT"]);
    expect(signatureClash(doc, "btn_OpenChatGPT", "dropdown", dd.uid, "onAction")?.label).toBe("ChatGPT바로가기");
    expect(signatureClash(doc, "get_Init", "selitem", dd.uid, "getSelectedItemID")).toBeUndefined();

    const errors = validateDoc(doc, new Set()).filter((i) => i.level === "error");
    expect(errors.some((i) => i.message.includes("btn_OpenChatGPT") && i.message.includes("드롭다운 선택"))).toBe(true);
    expect(errors.some((i) => i.message.includes("get_Init"))).toBe(false);
  });
});
