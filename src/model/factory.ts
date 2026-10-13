import { BUILTIN_GROUP_BY_ID, BUILTIN_TABS, type BuiltinGroupId } from "@/constants/idMso";
import { CONTROL_NAME } from "@/constants/controls";
import { IdIssuer, PREFIX } from "./ids";
import type {
  ButtonControl,
  BuiltinGroup,
  BuiltinTab,
  Control,
  ControlBase,
  ControlType,
  CustomGroup,
  CustomTab,
  ListItem,
  RibbonDoc,
} from "./types";
import { EMPTY_SETTINGS } from "./types";
import { allUids, allXmlIds } from "./walk";

function base(issuer: IdIssuer, type: ControlType, label: string): ControlBase {
  return {
    uid: issuer.uid(),
    type,
    id: issuer.next(PREFIX[type] ?? "ctl"),
    label,
    screentip: "",
    supertip: "",
    keytip: "",
    size: type === "checkBox" || type === "editBox" || type === "comboBox" || type === "dropDown" || type === "labelControl" || type === "separator" ? "normal" : "large",
    visible: true,
    enabled: true,
    showLabel: true,
    showImage: true,
    imageMso: "",
    imageId: "",
  };
}

export function createButton(issuer: IdIssuer, label = "버튼"): ButtonControl {
  return { ...base(issuer, "button", label), type: "button", onAction: "" };
}

export function createItem(issuer: IdIssuer, label = "항목"): ListItem {
  return { uid: issuer.uid(), id: issuer.next(PREFIX.item), label };
}

export function createControl(issuer: IdIssuer, type: ControlType): Control {
  const label = CONTROL_NAME[type];
  switch (type) {
    case "button":
      return createButton(issuer, label);
    case "toggleButton":
      return { ...base(issuer, type, label), type, onAction: "", getPressed: "" };
    case "checkBox":
      return { ...base(issuer, type, label), type, onAction: "", getPressed: "" };
    case "editBox":
      return { ...base(issuer, type, label), type, sizeString: "WWWWWWWWWWWW", maxLength: "", onChange: "", getText: "" };
    case "comboBox":
      return { ...base(issuer, type, label), type, items: [createItem(issuer, "항목 1")], sizeString: "", maxLength: "", onChange: "", getText: "" };
    case "dropDown":
      return { ...base(issuer, type, label), type, items: [createItem(issuer, "항목 1")], onAction: "", getSelectedItemID: "" };
    case "menu":
      return { ...base(issuer, type, label), type, items: [] };
    case "splitButton": {
      const button = createButton(issuer, "주 버튼");
      button.size = "normal";
      return { ...base(issuer, type, ""), type, button, menuId: issuer.next(PREFIX.menu), items: [] };
    }
    case "labelControl":
      return { ...base(issuer, type, "표시 문구"), type };
    case "separator":
      return { ...base(issuer, type, ""), type };
    case "unknown":
      return { ...base(issuer, type, "알 수 없는 요소"), type, rawXml: "" };
  }
}

export function nextGroupLabel(groups: { kind: string; label?: string }[]): string {
  let max = 0;
  for (const g of groups) {
    if (g.kind !== "custom" || !g.label) continue;
    const m = /그룹 (\d+)/.exec(g.label);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `그룹 ${max + 1}`;
}

export function createGroup(issuer: IdIssuer, label?: string): CustomGroup {
  return { kind: "custom", uid: issuer.uid(), id: issuer.next(PREFIX.group), label: label ?? "그룹 1", controls: [] };
}

export function createBuiltinGroup(issuer: IdIssuer, idMso: BuiltinGroupId): BuiltinGroup {
  const meta = BUILTIN_GROUP_BY_ID[idMso];
  return { kind: "builtin", uid: issuer.uid(), idMso, displayName: meta.displayName };
}

export function createCustomTab(issuer: IdIssuer, index: number): CustomTab {
  return {
    kind: "custom",
    uid: issuer.uid(),
    id: issuer.next(PREFIX.tab),
    label: `사용자 탭 ${index}`,
    keytip: "",
    visible: true,
    insertAfterMso: "",
    insertBeforeMso: "",
    groups: [],
  };
}

export function createBuiltinTab(issuer: IdIssuer, idMso: string, label: string): BuiltinTab {
  return { kind: "builtin", uid: issuer.uid(), idMso, label, visible: true, groups: [] };
}

export function officialBuiltinTabs(issuer = new IdIssuer()): BuiltinTab[] {
  return BUILTIN_TABS.map((t) => createBuiltinTab(issuer, t.idMso, t.label));
}

export function ensureBuiltinTabs(doc: RibbonDoc): RibbonDoc {
  const issuer = issuerFromDoc(doc.tabs.map((t) => t.uid));
  const byId = new Map<string, BuiltinTab>();
  for (const tab of doc.tabs) {
    if (tab.kind === "builtin") byId.set(normalizeTabIdMso(tab.idMso), tab);
  }
  const builtins = BUILTIN_TABS.map((meta) => {
    const existing = byId.get(meta.idMso);
    if (existing) return { ...existing, idMso: meta.idMso, label: meta.label };
    return createBuiltinTab(issuer, meta.idMso, meta.label);
  });
  const extras = doc.tabs.filter((t) => t.kind === "builtin" && !BUILTIN_TABS.some((m) => m.idMso === normalizeTabIdMso(t.idMso)));
  const customs = doc.tabs.filter((t) => t.kind === "custom");
  return { settings: doc.settings ?? { ...EMPTY_SETTINGS }, tabs: [...builtins, ...extras, ...customs] };
}

export function normalizeTabIdMso(idMso: string): string {
  if (idMso === "TabDraw") return "TabDrawInk";
  return idMso;
}

export function emptyRibbon(): RibbonDoc {
  return { settings: { ...EMPTY_SETTINGS }, tabs: officialBuiltinTabs() };
}

export function issuerFromDoc(ids: string[]): IdIssuer {
  return new IdIssuer(ids, 1);
}

export function issuerFromRibbon(doc: RibbonDoc): IdIssuer {
  return new IdIssuer([...allXmlIds(doc), ...allUids(doc)], 1);
}
