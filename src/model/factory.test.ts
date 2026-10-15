import { describe, expect, it } from "vitest";
import { parseCustomUi } from "@/xml/parse";
import { dedupeUids, ensureBuiltinTabs } from "./factory";
import { allUids } from "./walk";
import type { RibbonDoc } from "./types";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<customUI xmlns="http://schemas.microsoft.com/office/2009/07/customui"><ribbon><tabs>
<tab id="tab_11" label="업무자동화" insertAfterMso="TabInsert">
<group id="grp_12" label="자동화그룹">
<button id="btn_13" label="ChatGpt열기" onAction="btn_OpenChatGPT"/>
<button id="btn_14" label="파일취합" onAction="btn_MerFile"/>
</group>
<group id="grp_16" label="메일발송자동화">
<dropDown id="dd_18" label="웹페이지바로가기" onAction="dd_Website"><item id="youtube" label="유튜브"/></dropDown>
<button id="btn_15" label="메일일괄발송" onAction="btn_SendMail"/>
</group>
</tab></tabs></ribbon></customUI>`;

const dupes = (doc: RibbonDoc) => {
  const ids = allUids(doc);
  return ids.filter((id, i) => ids.indexOf(id) !== i);
};

describe("ensureBuiltinTabs", () => {
  it("불러온 리본에 내장 탭을 더해도 uid가 겹치지 않는다", () => {
    const doc = ensureBuiltinTabs(parseCustomUi(XML).doc);
    expect(doc.tabs.some((t) => t.kind === "builtin" && t.idMso === "TabFormulas")).toBe(true);
    expect(dupes(doc)).toEqual([]);
  });

  it("예전 초안처럼 내장 탭과 컨트롤의 uid가 겹쳐 있으면 고친다", () => {
    const doc = ensureBuiltinTabs(parseCustomUi(XML).doc);
    const formulas = doc.tabs.find((t) => t.kind === "builtin" && t.idMso === "TabFormulas")!;
    const custom = doc.tabs.find((t) => t.kind === "custom")!;
    const broken = structuredClone(doc);
    const control = broken.tabs.find((t) => t.uid === custom.uid)!.groups[1];
    if (control.kind !== "custom") throw new Error("custom group expected");
    control.controls[0].uid = formulas.uid;
    expect(dupes(broken)).not.toEqual([]);
    const fixed = dedupeUids(broken);
    expect(dupes(fixed)).toEqual([]);
    // 내장 탭은 원래 uid를 그대로 쓴다.
    expect(fixed.tabs.find((t) => t.kind === "builtin" && t.idMso === "TabFormulas")!.uid).toBe(formulas.uid);
  });
});
