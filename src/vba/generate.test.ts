import { describe, expect, it } from "vitest";
import { createControl, createCustomTab, createGroup } from "@/model/factory";
import { IdIssuer } from "@/model/ids";
import { generateVba, pruneMacros, signatureClash, signatureConflicts, paramsMismatch } from "./generate";
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

  it("드롭다운은 TODO 자리를 두고 getSelectedItemID는 첫 항목을 돌려준다", () => {
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
    expect(vba).toContain("Sub dd_Pick(control As IRibbonControl, id As String, index As Integer)\r\n    ' TODO: 선택된 항목 처리 (id / index)\r\nEnd Sub");
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

  it("머리말·MyRibbon·이름순 형식으로 만들고, 이미지가 있어도 LoadImage는 넣지 않는다", () => {
    const issuer = new IdIssuer();
    const tab = createCustomTab(issuer, 1);
    const g = createGroup(issuer);
    const send = createControl(issuer, "button");
    const merge = createControl(issuer, "button");
    const chk = createControl(issuer, "checkBox");
    if (send.type !== "button" || merge.type !== "button" || chk.type !== "checkBox") throw new Error("type");
    send.onAction = "btn_SendMail";
    send.imageId = "img_mail";
    merge.onAction = "btn_MergeFile";
    chk.getPressed = "chk_Init";
    g.controls.push(send, merge, chk);
    tab.groups.push(g);
    const vba = generateVba({ tabs: [tab] });
    expect(vba.startsWith("' ====")).toBe(true);
    expect(vba).toContain("' 사용법: Alt+F11 → 삽입 → 모듈 → 아래 전체를 붙여넣기");
    expect(vba).toContain("Public MyRibbon As IRibbonUI");
    expect(vba.indexOf("Sub btn_MergeFile(")).toBeLessThan(vba.indexOf("Sub btn_SendMail("));
    expect(vba).toContain(`Sub btn_SendMail(control As IRibbonControl)\r\n    ' TODO: 매크로 코드를 작성하세요\r\n    MsgBox "btn_SendMail 호출됨"\r\nEnd Sub`);
    expect(vba).toContain("    returnedVal = False");
    expect(vba).not.toContain('MsgBox "chk_Init');
    expect(vba).not.toContain("LoadImage");
    expect(generateVba({ tabs: [tab] }, [], { embedded: true })).not.toContain("사용법");
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

  it("연결이 끊긴 매크로는 목록에서 빼고, 파일·직접 등록·본문 있는 매크로는 남긴다", () => {
    const issuer = new IdIssuer();
    const tab = createCustomTab(issuer, 1);
    const g = createGroup(issuer);
    const btn = createControl(issuer, "button");
    if (btn.type !== "button") throw new Error("type");
    btn.onAction = "btn_InUse";
    g.controls.push(btn);
    tab.groups.push(g);
    const kept = pruneMacros({ tabs: [tab] }, [
      { name: "btn_InUse", source: "builder" },
      { name: "btn_Deleted", source: "builder" },
      { name: "cbo_FromXml", source: "manual" },
      { name: "btn_InFile", source: "file" },
      { name: "btn_Registered", source: "manual", pinned: true },
      { name: "btn_HasCode", source: "builder", body: "MsgBox 1" },
    ]).map((m) => m.name);
    expect(kept).toEqual(["btn_InUse", "btn_InFile", "btn_Registered", "btn_HasCode"]);
  });

  it("appendOnly는 파일에 없는 매크로의 Sub만 만든다", () => {
    const issuer = new IdIssuer();
    const tab = createCustomTab(issuer, 1);
    const g = createGroup(issuer);
    const a = createControl(issuer, "button");
    const b = createControl(issuer, "button");
    if (a.type !== "button" || b.type !== "button") throw new Error("type");
    a.onAction = "btn_OpenChatGPT";
    a.imageId = "img_x";
    b.onAction = "btn_prompt";
    g.controls.push(a, b);
    tab.groups.push(g);
    const doc = { tabs: [tab] };
    // 대소문자가 달라도 같은 매크로로 본다.
    const vba = generateVba(doc, [{ name: "BTN_OPENCHATGPT", source: "file" }], { embedded: true, appendOnly: true });
    expect(vba).toContain("Sub btn_prompt(control As IRibbonControl)");
    expect(vba).not.toContain("btn_OpenChatGPT");
    expect(vba).not.toContain("MyRibbon");
    expect(vba).not.toContain("LoadImage");
    expect(generateVba(doc, [{ name: "btn_OpenChatGPT", source: "file" }, { name: "btn_prompt", source: "file" }], { appendOnly: true })).toBe("");
  });
});

describe("paramsMismatch", () => {
  it("버튼 칸에는 control As IRibbonControl 하나만 받는 Sub만 맞다", () => {
    expect(paramsMismatch("control As IRibbonControl", "button")).toBeUndefined();
    expect(paramsMismatch("imageID As String, ByRef image", "button")).toContain("쓸 수 없음");
    expect(paramsMismatch("", "button")).toContain("매개변수가 없는");
  });
  it("드롭다운·토글·입력 칸도 형식을 본다", () => {
    expect(paramsMismatch("control As IRibbonControl, id As String, index As Integer", "dropdown")).toBeUndefined();
    expect(paramsMismatch("control As IRibbonControl", "dropdown")).toBeDefined();
    expect(paramsMismatch("control As IRibbonControl, pressed As Boolean", "pressed")).toBeUndefined();
    expect(paramsMismatch("control As IRibbonControl, text As String", "pressed")).toBeDefined();
    expect(paramsMismatch("imageID As String, ByRef image", "getval")).toBeDefined();
  });
  it("매개변수를 모르면 막지 않는다", () => {
    expect(paramsMismatch(undefined, "button")).toBeUndefined();
  });
});
