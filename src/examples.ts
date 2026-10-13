import { createBuiltinGroup, createControl, createCustomTab, createGroup, emptyRibbon } from "@/model/factory";
import { IdIssuer } from "@/model/ids";
import type { RibbonDoc } from "@/model/types";

export interface ExampleRibbon {
  id: string;
  name: string;
  desc: string;
  doc: () => RibbonDoc;
}

export const EXAMPLES: ExampleRibbon[] = [
  {
    id: "quick",
    name: "간단 실행",
    desc: "사용자 탭 하나와 실행 단추 세 개",
    doc: () => {
      const base = emptyRibbon();
      const issuer = new IdIssuer();
      const tab = createCustomTab(issuer, 1);
      tab.label = "실행";
      const g = createGroup(issuer, "작업");
      for (const [type, label, macro] of [
        ["button", "저장", "btn_Save"],
        ["button", "새로 고침", "btn_Refresh"],
        ["button", "도움말", "btn_Help"],
      ] as const) {
        const c = createControl(issuer, type);
        if (c.type === "button") { c.label = label; c.onAction = macro; }
        g.controls.push(c);
      }
      tab.groups.push(g);
      return { ...base, tabs: [...base.tabs, tab] };
    },
  },
  {
    id: "dev",
    name: "개발 도구 모음",
    desc: "코드·컨트롤·XML 내장 그룹을 한 탭에",
    doc: () => {
      const base = emptyRibbon();
      const issuer = new IdIssuer();
      const tab = createCustomTab(issuer, 1);
      tab.label = "개발";
      tab.groups.push(
        createBuiltinGroup(issuer, "GroupCode"),
        createBuiltinGroup(issuer, "GroupControls"),
        createBuiltinGroup(issuer, "GroupXml"),
      );
      return { ...base, tabs: [...base.tabs, tab] };
    },
  },
];
