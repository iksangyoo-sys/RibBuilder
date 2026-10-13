import { IdIssuer, PREFIX } from "@/model/ids";
import { allXmlIds, walkControls } from "@/model/walk";
import type { Control, MacroDef, RibbonDoc } from "@/model/types";
import { collectCallbacks } from "@/vba/generate";
import { parseCustomUi } from "./parse";

export interface ImportPreview {
  tabs: number;
  groups: number;
  controls: number;
  callbacks: string[];
  notes: string[];
}

export function previewXml(xml: string): ImportPreview {
  const parsed = parseCustomUi(xml);
  let groups = 0;
  let controls = 0;
  for (const tab of parsed.doc.tabs) {
    groups += tab.groups.length;
    for (const g of tab.groups) {
      if (g.kind === "custom") controls += g.controls.length;
    }
  }
  return {
    tabs: parsed.doc.tabs.length,
    groups,
    controls,
    callbacks: [...new Set(collectCallbacks(parsed.doc).map((c) => c.name))],
    notes: parsed.notes,
  };
}

function remapControlIds(c: Control, issuer: IdIssuer, used: Set<string>, changes: { from: string; to: string }[]): void {
  const take = (id: string, prefix: string) => {
    if (!id) return id;
    if (!used.has(id)) {
      used.add(id);
      issuer.take(id);
      return id;
    }
    const next = issuer.next(prefix);
    changes.push({ from: id, to: next });
    used.add(next);
    return next;
  };
  c.id = take(c.id, PREFIX[c.type] ?? "ctl");
  if (c.type === "splitButton") c.menuId = take(c.menuId, PREFIX.menu);
  if (c.type === "comboBox" || c.type === "dropDown") {
    for (const it of c.items) it.id = take(it.id, PREFIX.item);
  }
  if (c.type === "menu" || c.type === "splitButton") c.items.forEach((x) => remapControlIds(x, issuer, used, changes));
  if (c.type === "splitButton") remapControlIds(c.button, issuer, used, changes);
}

export function remapCollidingIds(incoming: RibbonDoc, existingIds: Iterable<string>): { doc: RibbonDoc; changes: { from: string; to: string }[] } {
  const used = new Set(existingIds);
  const issuer = new IdIssuer(used);
  const changes: { from: string; to: string }[] = [];
  const doc = structuredClone(incoming);
  for (const tab of doc.tabs) {
    if (tab.kind === "custom") {
      if (used.has(tab.id)) {
        const next = issuer.next(PREFIX.tab);
        changes.push({ from: tab.id, to: next });
        tab.id = next;
      }
      used.add(tab.id);
    }
    for (const g of tab.groups) {
      if (g.kind === "custom") {
        if (used.has(g.id)) {
          const next = issuer.next(PREFIX.group);
          changes.push({ from: g.id, to: next });
          g.id = next;
        }
        used.add(g.id);
        g.controls.forEach((c) => remapControlIds(c, issuer, used, changes));
      }
    }
  }
  return { doc, changes };
}

export function mergeRibbon(base: RibbonDoc, incoming: RibbonDoc): { doc: RibbonDoc; changes: { from: string; to: string }[] } {
  const { doc, changes } = remapCollidingIds(incoming, allXmlIds(base));
  const customs = doc.tabs.filter((t) => t.kind === "custom");
  const incomingBuiltins = doc.tabs.filter((t) => t.kind === "builtin");
  const tabs = [...base.tabs];
  for (const b of incomingBuiltins) {
    const idx = tabs.findIndex((t) => t.kind === "builtin" && t.idMso === b.idMso);
    if (idx >= 0) tabs[idx] = { ...tabs[idx], groups: [...tabs[idx].groups, ...b.groups], visible: b.visible };
    else tabs.push(b);
  }
  tabs.push(...customs);
  return { doc: { settings: incoming.settings ?? base.settings, tabs }, changes };
}

export function macrosFromDoc(doc: RibbonDoc, source: MacroDef["source"] = "manual"): MacroDef[] {
  const seen = new Set<string>();
  const out: MacroDef[] = [];
  for (const cb of collectCallbacks(doc)) {
    if (!cb.name || seen.has(cb.name)) continue;
    seen.add(cb.name);
    out.push({ name: cb.name, source, callbackKind: cb.kind });
  }
  walkControls(doc, () => undefined);
  return out;
}
