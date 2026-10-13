import { create } from "zustand";
import { BUILTIN_GROUP_BY_ID, BUILTIN_TABS, type BuiltinGroupId } from "@/constants/idMso";
import { cloneControl, cloneGroup, cloneGroupAfter, cloneTabAfter } from "@/model/clone";
import { createBuiltinGroup, createControl, createCustomTab, createGroup, emptyRibbon, ensureBuiltinTabs, issuerFromRibbon, nextGroupLabel } from "@/model/factory";
import type {
  Control,
  ControlType,
  CustomGroup,
  MacroDef,
  OriginKind,
  RibbonDoc,
  RibbonImage,
  Selection,
  Tab,
} from "@/model/types";
import { findControl, findGroup, findTab, walkControls } from "@/model/walk";
import { openWorkbook } from "@/ooxml/read";
import { BLANK_XLSX_B64 } from "@/ooxml/blank";
import { parseCustomUi } from "@/xml/parse";
import { macrosFromDoc, mergeRibbon } from "@/xml/merge";
import { EXAMPLES } from "@/examples";
import { b64ToBytes, clearDraft, loadDraft, saveDraft } from "./persist";
import { pruneMacros } from "@/vba/generate";

function blankBytes(): Uint8Array {
  return b64ToBytes(BLANK_XLSX_B64);
}

interface Snapshot {
  ribbon: RibbonDoc;
  images: RibbonImage[];
  macros: MacroDef[];
}

export interface EditorState {
  started: boolean;
  fileName: string;
  originKind: OriginKind;
  originBytes: Uint8Array | null;
  hasExistingVba: boolean;
  includeVba: boolean;
  dirty: boolean;
  ribbon: RibbonDoc;
  images: RibbonImage[];
  macros: MacroDef[];
  notes: string[];
  selection: Selection;
  clipboard: { kind: "control"; value: Control } | { kind: "group"; value: CustomGroup } | null;
  past: Snapshot[];
  future: Snapshot[];
  startBlank: () => void;
  startExample: (id: string) => void;
  resumeDraft: () => boolean;
  openFile: (file: File) => Promise<void>;
  setIncludeVba: (value: boolean) => void;
  select: (selection: Selection) => void;
  addTab: () => void;
  addBuiltinTab: (idMso: string) => void;
  addGroup: (tabUid: string) => void;
  /** 기본 탭의 그룹 사이에 새 그룹을 넣는다 (beforeMso 앞, 없으면 탭 끝). */
  addGroupAt: (tabUid: string, beforeMso?: string) => void;
  /** 탭 줄의 기본 탭 사이에 새 사용자 탭을 넣는다 (beforeMso 앞, 없으면 끝). */
  addTabAt: (beforeMso?: string) => void;
  addControl: (groupUid: string, type: ControlType, beforeUid?: string) => void;
  addControlToSelection: (type: ControlType) => string | null;
  addBuiltinGroup: (tabUid: string, idMso: BuiltinGroupId) => string | null;
  addBuiltinToSelection: (idMso: BuiltinGroupId) => string | null;
  renameTab: (uid: string, label: string) => void;
  renameGroup: (uid: string, label: string) => void;
  duplicateTab: (uid: string) => void;
  duplicateGroup: (uid: string) => void;
  duplicateControl: (uid: string) => void;
  deleteTab: (uid: string) => void;
  deleteGroup: (uid: string) => void;
  deleteControl: (uid: string) => void;
  deleteSelection: () => void;
  hideBuiltinTab: (uid: string) => void;
  clearBuiltinGroups: (uid: string) => void;
  copySelection: () => void;
  cutSelection: () => void;
  pasteSelection: () => void;
  toggleControlSize: (uid: string) => void;
  moveTab: (from: number, to: number) => void;
  placeTabAfter: (tabUid: string, afterIdMso: string) => void;
  moveGroup: (tabUid: string, from: number, to: number) => void;
  moveControl: (fromGroup: string, toGroup: string, uid: string, beforeUid?: string) => void;
  patchTab: (uid: string, patch: Partial<Tab>) => void;
  patchGroup: (uid: string, patch: Partial<CustomGroup>) => void;
  patchControl: (uid: string, patch: Partial<Control>) => void;
  patchSettings: (patch: { startFromScratch?: boolean; onLoad?: string }) => void;
  addImage: (image: RibbonImage, controlUid: string) => void;
  removeImage: (id: string) => void;
  addMacro: (macro: MacroDef) => void;
  removeMacro: (name: string) => void;
  removeMacros: (names: string[]) => void;
  renameMacro: (oldName: string, newName: string) => void;
  setMacroBody: (name: string, body: string) => void;
  importXml: (xml: string, mode?: "replace" | "merge") => { ok: true; changes: { from: string; to: string }[] } | { ok: false; message: string };
  markSaved: () => void;
  persistNow: () => void;
  undo: () => void;
  redo: () => void;
}

function snap(s: Pick<EditorState, "ribbon" | "images" | "macros">): Snapshot {
  return {
    ribbon: structuredClone(s.ribbon),
    images: structuredClone(s.images),
    macros: structuredClone(s.macros),
  };
}

function nextTabIndex(tabs: Tab[]): number {
  let max = 0;
  for (const t of tabs) {
    if (t.kind !== "custom") continue;
    const m = /사용자 탭 (\d+)/.exec(t.label);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

function replaceMacro(doc: RibbonDoc, oldName: string, newName: string): void {
  const visit = (c: Control) => {
    const rec = c as unknown as Record<string, unknown>;
    for (const key of ["onAction", "onChange", "getPressed", "getText", "getSelectedItemID"]) {
      if (rec[key] === oldName) rec[key] = newName;
    }
    if (c.type === "menu" || c.type === "splitButton") c.items.forEach(visit);
    if (c.type === "splitButton") visit(c.button);
  };
  for (const tab of doc.tabs) {
    for (const g of tab.groups) {
      if (g.kind === "custom") g.controls.forEach(visit);
    }
  }
}

function blankSession(): Pick<
  EditorState,
  | "started"
  | "fileName"
  | "originKind"
  | "originBytes"
  | "hasExistingVba"
  | "includeVba"
  | "dirty"
  | "ribbon"
  | "images"
  | "macros"
  | "notes"
  | "selection"
  | "clipboard"
  | "past"
  | "future"
> {
  return {
    started: true,
    fileName: "새 통합문서.xlsx",
    originKind: "blank",
    originBytes: blankBytes(),
    hasExistingVba: false,
    includeVba: true,
    dirty: false,
    ribbon: emptyRibbon(),
    images: [],
    macros: [],
    notes: [],
    selection: { kind: "none" },
    clipboard: null,
    past: [],
    future: [],
  };
}

function sessionFromDraft() {
  const draft = loadDraft();
  if (!draft) return null;
  return {
    started: true,
    fileName: draft.fileName,
    originKind: draft.originKind,
    originBytes: draft.originBytesB64 ? b64ToBytes(draft.originBytesB64) : blankBytes(),
    hasExistingVba: draft.hasExistingVba,
    includeVba: draft.vbaPref === 3 ? draft.includeVba : true,
    dirty: true,
    ribbon: ensureBuiltinTabs(draft.ribbon),
    images: draft.images,
    macros: pruneMacros(draft.ribbon, draft.macros),
    notes: [] as string[],
    selection: { kind: "none" as const },
    clipboard: null,
    past: [],
    future: [],
  };
}

function persistState(s: EditorState): void {
  saveDraft({
    fileName: s.fileName,
    originKind: s.originKind,
    originBytes: s.originBytes,
    includeVba: s.includeVba,
    hasExistingVba: s.hasExistingVba,
    ribbon: s.ribbon,
    images: s.images,
    macros: s.macros,
  });
}

function currentTabUid(s: EditorState): string | undefined {
  const sel = s.selection;
  if (sel.kind === "tab") return sel.uid;
  if (sel.kind === "group") return findGroup(s.ribbon, sel.uid)?.tab.uid;
  if (sel.kind === "control") return findControl(s.ribbon, sel.uid)?.tab.uid;
  return s.ribbon.tabs.find((t) => t.kind === "custom")?.uid ?? s.ribbon.tabs[0]?.uid;
}

function currentCustomGroupUid(s: EditorState): string | undefined {
  const sel = s.selection;
  if (sel.kind === "group") {
    const g = findGroup(s.ribbon, sel.uid);
    if (g?.group.kind === "custom") return g.group.uid;
    const tab = g?.tab;
    const last = tab?.groups.filter((x) => x.kind === "custom").at(-1);
    return last?.uid;
  }
  if (sel.kind === "control") return findControl(s.ribbon, sel.uid)?.group.uid;
  if (sel.kind === "tab") {
    const tab = findTab(s.ribbon, sel.uid);
    return tab?.groups.filter((x) => x.kind === "custom").at(-1)?.uid;
  }
  return undefined;
}

export const useEditorStore = create<EditorState>((set, get) => {
  const commit = (recipe: (draft: EditorState) => void) => {
    const cur = get();
    const past = [...cur.past, snap(cur)].slice(-100);
    const next = {
      ...cur,
      ribbon: structuredClone(cur.ribbon),
      images: structuredClone(cur.images),
      macros: structuredClone(cur.macros),
      past,
      future: [],
      dirty: true,
    };
    recipe(next);
    next.macros = pruneMacros(next.ribbon, next.macros);
    persistState(next);
    set(next);
  };

  return {
    ...blankSession(),
    ...(sessionFromDraft() ?? {}),
    startBlank: () => {
      const next = { ...get(), ...blankSession() };
      persistState(next);
      set(next);
    },
    startExample: (id) => {
      const ex = EXAMPLES.find((e) => e.id === id);
      if (!ex) return;
      const ribbon = ensureBuiltinTabs(ex.doc());
      const macros = macrosFromDoc(ribbon, "builder");
      const next = {
        ...get(),
        started: true,
        fileName: "새 통합문서.xlsx",
        originKind: "blank" as const,
        originBytes: blankBytes(),
        hasExistingVba: false,
        includeVba: true,
        dirty: true,
        ribbon,
        images: [],
        macros,
        notes: [],
        selection: ribbon.tabs.find((t) => t.kind === "custom")
          ? { kind: "tab" as const, uid: ribbon.tabs.find((t) => t.kind === "custom")!.uid }
          : { kind: "none" as const },
        clipboard: null,
        past: [],
        future: [],
      };
      persistState(next);
      set(next);
    },
    resumeDraft: () => {
      const draft = loadDraft();
      if (!draft) return false;
      set({
        started: true,
        fileName: draft.fileName,
        originKind: draft.originKind,
        originBytes: draft.originBytesB64 ? b64ToBytes(draft.originBytesB64) : blankBytes(),
        hasExistingVba: draft.hasExistingVba,
        includeVba: draft.vbaPref === 3 ? draft.includeVba : true,
        dirty: true,
        ribbon: ensureBuiltinTabs(draft.ribbon),
        images: draft.images,
        macros: pruneMacros(draft.ribbon, draft.macros),
        notes: [],
        selection: { kind: "none" },
        clipboard: null,
        past: [],
        future: [],
      });
      return true;
    },
    openFile: async (file) => {
      const opened = await openWorkbook(await file.arrayBuffer(), file.name);
      const ribbon = ensureBuiltinTabs(opened.ribbon.doc);
      const fromFile: MacroDef[] = opened.fileMacros.map((name) => ({ name, source: "file" }));
      const fromXml = macrosFromDoc(ribbon, "manual").filter((m) => !fromFile.some((f) => f.name === m.name));
      const next = {
        ...get(),
        started: true,
        fileName: opened.fileName,
        originKind: opened.kind,
        originBytes: opened.bytes,
        hasExistingVba: opened.hasVba,
        includeVba: true,
        dirty: false,
        ribbon,
        images: opened.images,
        macros: [...fromFile, ...fromXml],
        notes: opened.ribbon.notes,
        selection: { kind: "none" as const },
        clipboard: null,
        past: [],
        future: [],
      };
      persistState(next);
      set(next);
    },
    setIncludeVba: (value) => set({ includeVba: value }),
    select: (selection) => set({ selection }),
    addTab: () =>
      commit((s) => {
        const issuer = issuerFromRibbon(s.ribbon);
        const tab = createCustomTab(issuer, nextTabIndex(s.ribbon.tabs));
        s.ribbon.tabs.push(tab);
        s.selection = { kind: "tab", uid: tab.uid };
      }),
    addTabAt: (beforeMso) =>
      commit((s) => {
        const issuer = issuerFromRibbon(s.ribbon);
        const tab = createCustomTab(issuer, nextTabIndex(s.ribbon.tabs));
        // 같은 자리에 여러 탭을 넣어도 넣은 순서대로 놓이도록 "다음 기본 탭 앞"으로 지정한다.
        tab.insertBeforeMso = beforeMso ?? "";
        tab.insertAfterMso = "";
        s.ribbon.tabs.push(tab);
        s.selection = { kind: "tab", uid: tab.uid };
      }),
    addBuiltinTab: (idMso) =>
      commit((s) => {
        if (s.ribbon.tabs.some((t) => t.kind === "builtin" && t.idMso === idMso)) return;
        const meta = BUILTIN_TABS.find((t) => t.idMso === idMso);
        const issuer = issuerFromRibbon(s.ribbon);
        s.ribbon.tabs.push({
          kind: "builtin",
          uid: issuer.uid(),
          idMso,
          label: meta?.label ?? idMso,
          visible: true,
          groups: [],
        });
      }),
    addGroup: (tabUid) =>
      commit((s) => {
        const tab = findTab(s.ribbon, tabUid);
        if (!tab) return;
        const issuer = issuerFromRibbon(s.ribbon);
        const group = createGroup(issuer, nextGroupLabel(tab.groups));
        tab.groups.push(group);
        s.selection = { kind: "group", uid: group.uid };
      }),
    addGroupAt: (tabUid, beforeMso) =>
      commit((s) => {
        const tab = findTab(s.ribbon, tabUid);
        if (!tab) return;
        const issuer = issuerFromRibbon(s.ribbon);
        const group = createGroup(issuer, nextGroupLabel(tab.groups));
        if (beforeMso) group.insertBeforeMso = beforeMso;
        tab.groups.push(group);
        s.selection = { kind: "group", uid: group.uid };
      }),
    addControl: (groupUid, type, beforeUid) =>
      commit((s) => {
        const found = findGroup(s.ribbon, groupUid);
        if (!found || found.group.kind !== "custom") return;
        const issuer = issuerFromRibbon(s.ribbon);
        const control = createControl(issuer, type);
        const list = found.group.controls;
        const idx = beforeUid ? list.findIndex((c) => c.uid === beforeUid) : -1;
        if (idx >= 0) list.splice(idx, 0, control);
        else list.push(control);
        s.selection = { kind: "control", uid: control.uid };
      }),
    addControlToSelection: (type) => {
      const s = get();
      let groupUid = currentCustomGroupUid(s);
      if (!groupUid) {
        const tabUid = currentTabUid(s);
        if (!tabUid) return "탭을 먼저 선택하세요.";
        get().addGroup(tabUid);
        groupUid = currentCustomGroupUid(get());
      }
      if (!groupUid) return "그룹을 먼저 선택하세요.";
      get().addControl(groupUid, type);
      return null;
    },
    addBuiltinGroup: (tabUid, idMso) => {
      const tab = findTab(get().ribbon, tabUid);
      if (!tab) return "탭을 먼저 선택하세요.";
      if (tab.groups.some((g) => g.kind === "builtin" && g.idMso === idMso)) {
        return `이 탭에는 이미 ${BUILTIN_GROUP_BY_ID[idMso].displayName} 그룹이 있습니다.`;
      }
      commit((s) => {
        const t = findTab(s.ribbon, tabUid);
        if (!t) return;
        const issuer = issuerFromRibbon(s.ribbon);
        const group = createBuiltinGroup(issuer, idMso);
        t.groups.push(group);
        s.selection = { kind: "group", uid: group.uid };
      });
      return null;
    },
    addBuiltinToSelection: (idMso) => {
      const tabUid = currentTabUid(get());
      if (!tabUid) return "탭을 먼저 선택하세요.";
      return get().addBuiltinGroup(tabUid, idMso);
    },
    renameTab: (uid, label) =>
      commit((s) => {
        const tab = findTab(s.ribbon, uid);
        if (tab && tab.kind === "custom") tab.label = label;
      }),
    renameGroup: (uid, label) =>
      commit((s) => {
        const found = findGroup(s.ribbon, uid);
        if (found && found.group.kind === "custom") found.group.label = label;
      }),
    duplicateTab: (uid) =>
      commit((s) => {
        const { doc, tab } = cloneTabAfter(s.ribbon, uid);
        s.ribbon = doc;
        s.selection = { kind: "tab", uid: tab.uid };
      }),
    duplicateGroup: (uid) =>
      commit((s) => {
        const { doc, group } = cloneGroupAfter(s.ribbon, uid);
        s.ribbon = doc;
        s.selection = { kind: "group", uid: group.uid };
      }),
    duplicateControl: (uid) =>
      commit((s) => {
        const found = findControl(s.ribbon, uid);
        if (!found || found.group.kind !== "custom") return;
        const issuer = issuerFromRibbon(s.ribbon);
        const cloned = cloneControl(found.control, issuer);
        const idx = found.group.controls.findIndex((c) => c.uid === uid);
        found.group.controls.splice(idx + 1, 0, cloned);
        s.selection = { kind: "control", uid: cloned.uid };
      }),
    deleteTab: (uid) =>
      commit((s) => {
        const tab = findTab(s.ribbon, uid);
        if (tab?.kind === "builtin") {
          tab.groups = [];
          tab.visible = true;
          s.selection = { kind: "tab", uid };
          return;
        }
        s.ribbon.tabs = s.ribbon.tabs.filter((t) => t.uid !== uid);
        s.selection = s.ribbon.tabs[0] ? { kind: "tab", uid: s.ribbon.tabs[0].uid } : { kind: "none" };
      }),
    deleteGroup: (uid) =>
      commit((s) => {
        const found = findGroup(s.ribbon, uid);
        if (!found) return;
        found.tab.groups = found.tab.groups.filter((g) => g.uid !== uid);
        s.selection = { kind: "tab", uid: found.tab.uid };
      }),
    deleteControl: (uid) =>
      commit((s) => {
        const found = findControl(s.ribbon, uid);
        if (!found || found.group.kind !== "custom") return;
        const g = found.group;
        g.controls = g.controls.filter((c) => c.uid !== uid);
        for (const c of g.controls) {
          if (c.type === "menu") c.items = c.items.filter((x) => x.uid !== uid);
          if (c.type === "splitButton") c.items = c.items.filter((x) => x.uid !== uid);
        }
        s.selection = { kind: "group", uid: g.uid };
      }),
    deleteSelection: () => {
      const sel = get().selection;
      if (sel.kind === "tab") get().deleteTab(sel.uid);
      if (sel.kind === "group") get().deleteGroup(sel.uid);
      if (sel.kind === "control") get().deleteControl(sel.uid);
    },
    hideBuiltinTab: (uid) =>
      commit((s) => {
        const tab = findTab(s.ribbon, uid);
        if (tab && tab.kind === "builtin") tab.visible = !tab.visible;
      }),
    clearBuiltinGroups: (uid) =>
      commit((s) => {
        const tab = findTab(s.ribbon, uid);
        if (tab && tab.kind === "builtin") tab.groups = [];
      }),
    copySelection: () => {
      const sel = get().selection;
      if (sel.kind === "control") {
        const found = findControl(get().ribbon, sel.uid);
        if (found) set({ clipboard: { kind: "control", value: structuredClone(found.control) } });
      }
      if (sel.kind === "group") {
        const found = findGroup(get().ribbon, sel.uid);
        if (found && found.group.kind === "custom") set({ clipboard: { kind: "group", value: structuredClone(found.group) } });
      }
    },
    cutSelection: () => {
      get().copySelection();
      const sel = get().selection;
      if (sel.kind === "control") get().deleteControl(sel.uid);
      if (sel.kind === "group") get().deleteGroup(sel.uid);
    },
    pasteSelection: () =>
      commit((s) => {
        const clip = get().clipboard;
        if (!clip) return;
        const issuer = issuerFromRibbon(s.ribbon);
        if (clip.kind === "control") {
          let groupUid = currentCustomGroupUid(s);
          if (!groupUid) {
            const tabUid = currentTabUid(s);
            if (!tabUid) return;
            const tab = findTab(s.ribbon, tabUid);
            if (!tab) return;
            const g = createGroup(issuer, nextGroupLabel(tab.groups));
            tab.groups.push(g);
            groupUid = g.uid;
          }
          const found = findGroup(s.ribbon, groupUid);
          if (!found || found.group.kind !== "custom") return;
          const cloned = cloneControl(clip.value, issuer);
          found.group.controls.push(cloned);
          s.selection = { kind: "control", uid: cloned.uid };
        } else {
          const tabUid = currentTabUid(s);
          if (!tabUid) return;
          const tab = findTab(s.ribbon, tabUid);
          if (!tab) return;
          const cloned = cloneGroup(clip.value, issuer);
          tab.groups.push(cloned);
          s.selection = { kind: "group", uid: cloned.uid };
        }
      }),
    toggleControlSize: (uid) =>
      commit((s) => {
        const found = findControl(s.ribbon, uid);
        if (!found) return;
        found.control.size = found.control.size === "large" ? "normal" : "large";
      }),
    moveTab: (from, to) =>
      commit((s) => {
        const [tab] = s.ribbon.tabs.splice(from, 1);
        s.ribbon.tabs.splice(to, 0, tab);
      }),
    placeTabAfter: (tabUid, afterIdMso) =>
      commit((s) => {
        const tab = findTab(s.ribbon, tabUid);
        if (tab && tab.kind === "custom") {
          tab.insertAfterMso = afterIdMso;
          tab.insertBeforeMso = "";
        }
      }),
    moveGroup: (tabUid, from, to) =>
      commit((s) => {
        const tab = findTab(s.ribbon, tabUid);
        if (!tab) return;
        const [g] = tab.groups.splice(from, 1);
        tab.groups.splice(to, 0, g);
      }),
    moveControl: (fromGroup, toGroup, uid, beforeUid) =>
      commit((s) => {
        const from = findGroup(s.ribbon, fromGroup);
        const to = findGroup(s.ribbon, toGroup);
        if (!from || !to || from.group.kind !== "custom" || to.group.kind !== "custom") return;
        const idx = from.group.controls.findIndex((c) => c.uid === uid);
        if (idx < 0) return;
        const [item] = from.group.controls.splice(idx, 1);
        const at = beforeUid ? to.group.controls.findIndex((c) => c.uid === beforeUid) : -1;
        if (at >= 0) to.group.controls.splice(at, 0, item);
        else to.group.controls.push(item);
      }),
    patchTab: (uid, patch) =>
      commit((s) => {
        const tab = findTab(s.ribbon, uid);
        if (tab) Object.assign(tab, patch);
      }),
    patchGroup: (uid, patch) =>
      commit((s) => {
        const found = findGroup(s.ribbon, uid);
        if (found && found.group.kind === "custom") Object.assign(found.group, patch);
      }),
    patchControl: (uid, patch) =>
      commit((s) => {
        const found = findControl(s.ribbon, uid);
        if (found) Object.assign(found.control, patch);
      }),
    patchSettings: (patch) =>
      commit((s) => {
        s.ribbon.settings = { startFromScratch: false, onLoad: "", ...s.ribbon.settings, ...patch };
      }),
    addImage: (image, controlUid) =>
      commit((s) => {
        s.images.push(image);
        const found = findControl(s.ribbon, controlUid);
        if (found) {
          found.control.imageId = image.id;
          found.control.imageMso = "";
        }
      }),
    removeImage: (id) =>
      commit((s) => {
        s.images = s.images.filter((img) => img.id !== id);
        walkControls(s.ribbon, (c) => {
          if (c.imageId === id) c.imageId = "";
        });
      }),
    addMacro: (macro) =>
      commit((s) => {
        if (!s.macros.some((m) => m.name === macro.name)) s.macros.push(macro);
      }),
    removeMacro: (name) =>
      commit((s) => {
        s.macros = s.macros.filter((m) => m.name !== name);
        replaceMacro(s.ribbon, name, "");
      }),
    removeMacros: (names) =>
      commit((s) => {
        const drop = new Set(names);
        s.macros = s.macros.filter((m) => !drop.has(m.name));
        for (const name of drop) replaceMacro(s.ribbon, name, "");
      }),
    renameMacro: (oldName, newName) =>
      commit((s) => {
        s.macros = s.macros.map((m) => (m.name === oldName ? { ...m, name: newName } : m));
        replaceMacro(s.ribbon, oldName, newName);
      }),
    setMacroBody: (name, body) =>
      commit((s) => {
        s.macros = s.macros.map((m) => (m.name === name ? { ...m, body } : m));
      }),
    importXml: (xml, mode = "replace") => {
      try {
        const parsed = parseCustomUi(xml);
        const incoming = parsed.doc;
        const added = macrosFromDoc(incoming, "manual");
        if (mode === "merge") {
          let changes: { from: string; to: string }[] = [];
          commit((s) => {
            const merged = mergeRibbon(s.ribbon, incoming);
            s.ribbon = ensureBuiltinTabs(merged.doc);
            s.notes = parsed.notes;
            changes = merged.changes;
            for (const m of added) {
              if (!s.macros.some((x) => x.name === m.name)) s.macros.push(m);
            }
          });
          return { ok: true, changes };
        }
        commit((s) => {
          s.ribbon = ensureBuiltinTabs(incoming);
          s.notes = parsed.notes;
          s.selection = { kind: "none" };
          for (const m of added) {
            if (!s.macros.some((x) => x.name === m.name)) s.macros.push(m);
          }
        });
        return { ok: true, changes: [] };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : "XML을 읽지 못했습니다." };
      }
    },
    markSaved: () => {
      set({ dirty: false });
      persistState({ ...get(), dirty: false });
    },
    persistNow: () => persistState(get()),
    undo: () => {
      const cur = get();
      const prev = cur.past[cur.past.length - 1];
      if (!prev) return;
      const next = {
        ...cur,
        ribbon: prev.ribbon,
        images: prev.images,
        macros: prev.macros,
        past: cur.past.slice(0, -1),
        future: [snap(cur), ...cur.future].slice(0, 100),
        dirty: true,
      };
      persistState(next);
      set(next);
    },
    redo: () => {
      const cur = get();
      const nextSnap = cur.future[0];
      if (!nextSnap) return;
      const next = {
        ...cur,
        ribbon: nextSnap.ribbon,
        images: nextSnap.images,
        macros: nextSnap.macros,
        past: [...cur.past, snap(cur)],
        future: cur.future.slice(1),
        dirty: true,
      };
      persistState(next);
      set(next);
    },
  };
});

export function hasDraft(): boolean {
  return Boolean(loadDraft());
}

export { clearDraft };
