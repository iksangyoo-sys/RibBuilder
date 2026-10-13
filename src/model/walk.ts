import type { Control, Group, RibbonDoc, Tab } from "./types";

export function walkTabs(doc: RibbonDoc, fn: (tab: Tab, index: number) => void): void {
  doc.tabs.forEach(fn);
}

export function walkGroups(doc: RibbonDoc, fn: (group: Group, tab: Tab) => void): void {
  for (const tab of doc.tabs) for (const group of tab.groups) fn(group, tab);
}

export function walkControls(doc: RibbonDoc, fn: (control: Control, group: Group, tab: Tab) => void): void {
  walkGroups(doc, (group, tab) => {
    if (group.kind !== "custom") return;
    for (const control of group.controls) {
      fn(control, group, tab);
      if (control.type === "menu") control.items.forEach((c) => fn(c, group, tab));
      if (control.type === "splitButton") {
        fn(control.button, group, tab);
        control.items.forEach((c) => fn(c, group, tab));
      }
    }
  });
}

export function allUids(doc: RibbonDoc): string[] {
  const ids: string[] = [];
  for (const tab of doc.tabs) {
    ids.push(tab.uid);
    for (const g of tab.groups) {
      ids.push(g.uid);
      if (g.kind !== "custom") continue;
      for (const c of g.controls) {
        ids.push(c.uid);
        if (c.type === "menu" || c.type === "splitButton") c.items.forEach((x) => ids.push(x.uid));
        if (c.type === "splitButton") ids.push(c.button.uid);
        if (c.type === "comboBox" || c.type === "dropDown") c.items.forEach((x) => ids.push(x.uid));
      }
    }
  }
  return ids;
}

export function allXmlIds(doc: RibbonDoc): string[] {
  const ids: string[] = [];
  for (const tab of doc.tabs) {
    if (tab.kind === "custom") ids.push(tab.id);
    for (const group of tab.groups) {
      if (group.kind === "custom") ids.push(group.id);
    }
  }
  walkControls(doc, (c) => {
    ids.push(c.id);
    if (c.type === "splitButton") ids.push(c.menuId);
    if (c.type === "comboBox" || c.type === "dropDown") {
      c.items.forEach((it) => ids.push(it.id));
    }
  });
  return ids.filter(Boolean);
}

export function findTab(doc: RibbonDoc, uid: string): Tab | undefined {
  return doc.tabs.find((t) => t.uid === uid);
}

export function findGroup(doc: RibbonDoc, uid: string): { group: Group; tab: Tab } | undefined {
  for (const tab of doc.tabs) {
    const group = tab.groups.find((g) => g.uid === uid);
    if (group) return { group, tab };
  }
  return undefined;
}

export function findControl(doc: RibbonDoc, uid: string): { control: Control; group: Group; tab: Tab } | undefined {
  let found: { control: Control; group: Group; tab: Tab } | undefined;
  walkControls(doc, (control, group, tab) => {
    if (control.uid === uid) found = { control, group, tab };
  });
  return found;
}
