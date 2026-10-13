import { IdIssuer, PREFIX } from "./ids";
import { allUids, allXmlIds } from "./walk";
import type { ButtonControl, Control, Group, ListItem, RibbonDoc, Tab } from "./types";

function cloneButton(src: ButtonControl, issuer: IdIssuer): ButtonControl {
  return { ...src, uid: issuer.uid(), id: issuer.next(PREFIX.button) };
}

function cloneItems(items: ListItem[], issuer: IdIssuer): ListItem[] {
  return items.map((it) => ({ ...it, uid: issuer.uid(), id: issuer.next(PREFIX.item) }));
}

export function cloneControl(src: Control, issuer: IdIssuer): Control {
  const uid = issuer.uid();
  const id = issuer.next(PREFIX[src.type] ?? "ctl");
  switch (src.type) {
    case "button":
      return { ...src, uid, id };
    case "toggleButton":
    case "checkBox":
    case "editBox":
    case "labelControl":
    case "separator":
      return { ...src, uid, id };
    case "comboBox":
      return { ...src, uid, id, items: cloneItems(src.items, issuer) };
    case "dropDown":
      return { ...src, uid, id, items: cloneItems(src.items, issuer) };
    case "menu":
      return { ...src, uid, id, items: src.items.map((b) => cloneButton(b, issuer)) };
    case "splitButton":
      return {
        ...src,
        uid,
        id,
        menuId: issuer.next(PREFIX.menu),
        button: cloneButton(src.button, issuer),
        items: src.items.map((b) => cloneButton(b, issuer)),
      };
    case "unknown":
      return { ...src, uid, id };
  }
}

export function cloneGroup(src: Group, issuer: IdIssuer): Group {
  if (src.kind === "builtin") {
    return { ...src, uid: issuer.uid() };
  }
  return {
    ...src,
    uid: issuer.uid(),
    id: issuer.next(PREFIX.group),
    controls: src.controls.map((c) => cloneControl(c, issuer)),
  };
}

function collectUids(tab: Tab): string[] {
  const ids = [tab.uid];
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
  return ids;
}

/** 탭과 하위 요소를 깊은 복사하고 모든 id를 새로 발급한다. 라벨은 "원래이름 복사". */
export function deepCloneWithNewIds(tab: Tab, existingIds: Iterable<string> = []): Tab {
  const issuer = new IdIssuer([...existingIds, ...collectUids(tab)], 1);
  if (tab.kind === "builtin") {
    return {
      ...tab,
      uid: issuer.uid(),
      groups: tab.groups.map((g) => cloneGroup(g, issuer)),
    };
  }
  return {
    ...tab,
    uid: issuer.uid(),
    id: issuer.next(PREFIX.tab),
    label: `${tab.label} 복사`,
    groups: tab.groups.map((g) => cloneGroup(g, issuer)),
  };
}

export function cloneTabAfter(doc: RibbonDoc, tabUid: string): { doc: RibbonDoc; tab: Tab } {
  const index = doc.tabs.findIndex((t) => t.uid === tabUid);
  if (index < 0) throw new Error("탭을 찾을 수 없습니다.");
  const cloned = deepCloneWithNewIds(doc.tabs[index], [...allXmlIds(doc), ...allUids(doc)]);
  const tabs = [...doc.tabs];
  tabs.splice(index + 1, 0, cloned);
  return { doc: { ...doc, tabs }, tab: cloned };
}

export function cloneGroupAfter(doc: RibbonDoc, groupUid: string): { doc: RibbonDoc; group: Group } {
  for (const tab of doc.tabs) {
    const index = tab.groups.findIndex((g) => g.uid === groupUid);
    if (index < 0) continue;
    const issuer = new IdIssuer([...allXmlIds(doc), ...allUids(doc)], 1);
    const cloned = cloneGroup(tab.groups[index], issuer);
    if (cloned.kind === "custom") cloned.label = `${tab.groups[index].kind === "custom" ? tab.groups[index].label : cloned.label} 복사`;
    const groups = [...tab.groups];
    groups.splice(index + 1, 0, cloned);
    return {
      doc: { ...doc, tabs: doc.tabs.map((t) => (t.uid === tab.uid ? { ...t, groups } : t)) },
      group: cloned,
    };
  }
  throw new Error("그룹을 찾을 수 없습니다.");
}
