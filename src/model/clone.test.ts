import { describe, expect, it } from "vitest";
import { BUILTIN_GROUPS } from "@/constants/idMso";
import { deepCloneWithNewIds } from "./clone";
import { createBuiltinGroup, createControl, createCustomTab, createGroup } from "./factory";
import { IdIssuer } from "./ids";
import { allXmlIds } from "./walk";
import type { CustomTab } from "./types";

function sampleTab(): CustomTab {
  const issuer = new IdIssuer();
  const tab = createCustomTab(issuer, 1);
  tab.label = "도구";
  const g1 = createGroup(issuer, "하나");
  const g2 = createBuiltinGroup(issuer, BUILTIN_GROUPS[0].idMso);
  const button = createControl(issuer, "button");
  if (button.type === "button") button.onAction = "btn_Go";
  const menu = createControl(issuer, "menu");
  if (menu.type === "menu") menu.items.push(createControl(issuer, "button") as typeof menu.items[0]);
  const split = createControl(issuer, "splitButton");
  const drop = createControl(issuer, "dropDown");
  g1.controls.push(button, menu, split, drop);
  tab.groups.push(g1, g2);
  return tab;
}

describe("deepCloneWithNewIds", () => {
  it("라벨에 복사를 붙이고 모든 id를 새로 발급한다", () => {
    const tab = sampleTab();
    const original = allXmlIds({ tabs: [tab] });
    const cloned = deepCloneWithNewIds(tab, original);
    expect(cloned.kind).toBe("custom");
    if (cloned.kind !== "custom") return;
    expect(cloned.label).toBe("도구 복사");
    expect(cloned.id).not.toBe(tab.id);
    expect(cloned.uid).not.toBe(tab.uid);
    const cloneIds = allXmlIds({ tabs: [cloned] });
    const overlap = cloneIds.filter((id) => original.includes(id));
    expect(overlap).toEqual([]);
    expect(new Set(cloneIds).size).toBe(cloneIds.length);
  });

  it("하위 그룹·컨트롤·매크로 연결·아이콘을 유지한다", () => {
    const tab = sampleTab();
    const cloned = deepCloneWithNewIds(tab, allXmlIds({ tabs: [tab] }));
    const srcGroup = tab.groups[0];
    const dstGroup = cloned.groups[0];
    expect(srcGroup.kind).toBe("custom");
    expect(dstGroup.kind).toBe("custom");
    if (srcGroup.kind !== "custom" || dstGroup.kind !== "custom") return;
    expect(dstGroup.controls.map((c) => c.type)).toEqual(srcGroup.controls.map((c) => c.type));
    const srcBtn = srcGroup.controls[0];
    const dstBtn = dstGroup.controls[0];
    expect(srcBtn.type).toBe("button");
    expect(dstBtn.type).toBe("button");
    if (srcBtn.type === "button" && dstBtn.type === "button") {
      expect(dstBtn.onAction).toBe("btn_Go");
      expect(dstBtn.id).not.toBe(srcBtn.id);
    }
    expect(cloned.groups[1].kind).toBe("builtin");
  });
});
