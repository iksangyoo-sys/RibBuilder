import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type PointerSensorOptions,
} from "@dnd-kit/core";

class LeftPointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: "onPointerDown" as const,
      handler: ({ nativeEvent }: { nativeEvent: PointerEvent }) => nativeEvent.isPrimary && nativeEvent.button === 0,
    },
  ];
}
import { useCallback, useEffect, useRef, useState } from "react";
import { BottomPanel } from "./components/BottomPanel";
import { Canvas, ContextMenu, type MenuState } from "./components/Canvas";
import { ConfirmModal, HelpModal, IconModal, IssuesModal, MacroManager, NewMacroModal } from "./components/Modals";
import { FileBar } from "./components/FileBar";
import { Header } from "./components/Header";
import { Palette, parsePaletteId } from "./components/Palette";
import { Properties } from "./components/Properties";
import { SavedModal, XmlExportModal, XmlImportModal } from "./components/XmlModals";
import { findControl, findGroup } from "./model/walk";
import { validateDoc } from "./model/validate";
import { buildWorkbookBlob, downloadName } from "./ooxml/write";
import { localHelper, saveViaHelper } from "./ooxml/localSave";
import { useEditorStore } from "./store/useEditorStore";
import { generateVba } from "./vba/generate";
import { collectCallbacks } from "./vba/generate";

export function App() {
  const dirty = useEditorStore((s) => s.dirty);
  const fileRef = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState<MenuState>(null);
  const [renaming, setRenaming] = useState<{ kind: "tab" | "group"; uid: string } | null>(null);
  const [help, setHelp] = useState(false);
  const [newMacro, setNewMacro] = useState<{ key: string } | null>(null);
  const [macroManager, setMacroManager] = useState(false);
  const [icon, setIcon] = useState(false);
  const [xmlIn, setXmlIn] = useState(false);
  const [xmlOut, setXmlOut] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [confirm, setConfirm] = useState<{ message: string; run: () => void } | null>(null);
  const [issues, setIssues] = useState<ReturnType<typeof validateDoc> | null>(null);
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState<{ name: string; includeVba: boolean; hasCallback: boolean; appendedModule?: string; savedPath?: string } | null>(null);

  useEffect(() => {
    const onBefore = (e: BeforeUnloadEvent) => {
      if (!useEditorStore.getState().dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setMenu(null); setRenaming(null); return; }
      const tag = (e.target as HTMLElement).tagName;
      const typing = ["INPUT", "TEXTAREA"].includes(tag);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        beginSave();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        if (typing) return;
        e.preventDefault();
        if (e.shiftKey) useEditorStore.getState().redo();
        else useEditorStore.getState().undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        useEditorStore.getState().redo();
      }
      if (typing) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") useEditorStore.getState().copySelection();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "x") useEditorStore.getState().cutSelection();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") useEditorStore.getState().pasteSelection();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        const sel = useEditorStore.getState().selection;
        if (sel.kind === "tab") useEditorStore.getState().duplicateTab(sel.uid);
        if (sel.kind === "group") useEditorStore.getState().duplicateGroup(sel.uid);
        if (sel.kind === "control") useEditorStore.getState().duplicateControl(sel.uid);
      }
      const sel = useEditorStore.getState().selection;
      if (e.key === "F2") {
        if (sel.kind === "tab" || sel.kind === "group") setRenaming({ kind: sel.kind, uid: sel.uid });
      }
      if (e.key === "Delete") requestDelete();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const sensors = useSensors(useSensor<PointerSensorOptions>(LeftPointerSensor, { activationConstraint: { distance: 4 } }));

  const requestDelete = () => {
    const s = useEditorStore.getState();
    const sel = s.selection;
    if (sel.kind === "none") return;
    if (sel.kind === "tab") {
      const tab = s.ribbon.tabs.find((t) => t.uid === sel.uid);
      if (tab?.kind === "builtin") return;
      if (tab && tab.groups.length) {
        setConfirm({ message: "이 탭과 안의 그룹을 삭제할까요?", run: () => s.deleteTab(sel.uid) });
        return;
      }
    }
    if (sel.kind === "group") {
      const found = findGroup(s.ribbon, sel.uid);
      if (found?.group.kind === "custom" && found.group.controls.length) {
        setConfirm({ message: "이 그룹과 안의 컨트롤을 삭제할까요?", run: () => s.deleteGroup(sel.uid) });
        return;
      }
    }
    s.deleteSelection();
  };

  const onDragEnd = (event: DragEndEvent) => {
    const over = event.over;
    if (!over) return;
    const aid = String(event.active.id);
    const oid = String(over.id);
    const store = useEditorStore.getState();
    const pal = parsePaletteId(aid);
    if (pal && "type" in pal) {
      const groupUid = groupUidFromOver(oid, store.ribbon);
      if (groupUid) store.addControl(groupUid, pal.type);
      return;
    }
    if (pal && "builtin" in pal) {
      const tabUid = tabUidFromOver(oid, store.ribbon);
      if (tabUid) {
        const err = store.addBuiltinGroup(tabUid, pal.builtin);
        if (err) setNotice(err);
      }
      return;
    }
    if (aid.startsWith("tab:") && oid.startsWith("tab:")) {
      const overTab = store.ribbon.tabs.find((t) => `tab:${t.uid}` === oid);
      const activeTab = store.ribbon.tabs.find((t) => `tab:${t.uid}` === aid);
      if (activeTab?.kind === "custom" && overTab?.kind === "builtin") {
        store.placeTabAfter(activeTab.uid, overTab.idMso);
        return;
      }
      const from = store.ribbon.tabs.findIndex((t) => `tab:${t.uid}` === aid);
      const to = store.ribbon.tabs.findIndex((t) => `tab:${t.uid}` === oid);
      if (from >= 0 && to >= 0 && from !== to) store.moveTab(from, to);
      return;
    }
    if (aid.startsWith("group:") && oid.startsWith("group:")) {
      const fromUid = aid.slice(6);
      const toUid = oid.slice(6);
      const a = findGroup(store.ribbon, fromUid);
      const b = findGroup(store.ribbon, toUid);
      if (a && b && a.tab.uid === b.tab.uid) {
        const from = a.tab.groups.findIndex((g) => g.uid === fromUid);
        const to = a.tab.groups.findIndex((g) => g.uid === toUid);
        store.moveGroup(a.tab.uid, from, to);
      }
      return;
    }
    if (aid.startsWith("control:")) {
      const uid = aid.slice(8);
      const from = findControl(store.ribbon, uid);
      const toGroup = groupUidFromOver(oid, store.ribbon);
      if (from && toGroup) {
        const before = oid.startsWith("control:") ? oid.slice(8) : undefined;
        store.moveControl(from.group.uid, toGroup, uid, before);
      }
    }
  };

  const saveNow = useCallback(async () => {
    const s = useEditorStore.getState();
    const opts = {
      originBytes: s.originBytes,
      originKind: s.originKind,
      fileName: s.fileName,
      doc: s.ribbon,
      images: s.images,
      // 연결된 콜백이 없으면 매크로 없는 .xlsx로 저장한다.
      includeVba: s.includeVba && collectCallbacks(s.ribbon).length > 0,
      // 이미 VBA가 있으면 파일에 없는 매크로만 새 모듈로 더한다.
      vbaSource: generateVba(s.ribbon, s.macros, { embedded: true, appendOnly: s.hasExistingVba }),
      hasExistingVba: s.hasExistingVba,
      report: {} as { appendedModule?: string; vbaError?: string },
    };
    const blob = await buildWorkbookBlob(opts);
    if (opts.report.vbaError) {
      setNotice(`${opts.report.vbaError} 기존 VBA는 그대로 저장했습니다. 새 매크로는 VBA 패널의 코드를 복사해 붙여 넣으세요.`);
    }
    const name = downloadName({ ...opts, includeVba: opts.includeVba });
    // 로컬 실행기로 열렸으면 브라우저 다운로드 대신 실행기가 파일을 직접 쓴다
    // ('인터넷에서 받음' 표시가 붙지 않아 엑셀이 매크로를 막지 않는다).
    let savedPath: string | undefined;
    if (await localHelper()) {
      try {
        savedPath = await saveViaHelper(blob, name);
      } catch (err) {
        setNotice(`로컬 실행기로 저장하지 못해 브라우저 다운로드로 저장합니다. (${err instanceof Error ? err.message : "오류"})`);
      }
    }
    if (!savedPath) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(a.href);
        a.remove();
      }, 1000);
    }
    s.markSaved();
    setSaved({
      name: savedPath ? savedPath.split(/[\\/]/).pop() ?? name : name,
      includeVba: opts.includeVba && !opts.report.vbaError,
      hasCallback: collectCallbacks(s.ribbon).length > 0,
      appendedModule: opts.report.appendedModule,
      savedPath,
    });
  }, []);

  const beginSave = () => {
    const s = useEditorStore.getState();
    const found = validateDoc(s.ribbon, new Set(s.images.map((i) => i.id)), s.macros);
    if (found.some((i) => i.level === "error") || found.length) setIssues(found);
    else void saveNow();
  };

  const openAnother = () => {
    if (dirty && !window.confirm("저장하지 않은 내용이 있습니다. 다른 파일을 열까요?")) return;
    fileRef.current?.click();
  };

  const newDoc = () => {
    if (dirty && !window.confirm("저장하지 않은 내용이 있습니다. 새 문서를 만들까요?")) return;
    useEditorStore.getState().startBlank();
  };

  const openExample = (id: string) => {
    if (dirty && !window.confirm("저장하지 않은 내용이 있습니다. 예제를 열까요?")) return;
    useEditorStore.getState().startExample(id);
  };

  return (
    <div className="flex h-full flex-col" onContextMenu={(e) => e.preventDefault()}>
      <Header
        onNew={newDoc}
        onOpen={openAnother}
        onSave={beginSave}
        onExample={openExample}
      />
      <FileBar onOpenFile={openAnother} onSave={beginSave} onHelp={() => setHelp(true)} onMacros={() => setMacroManager(true)} />
      {notice ? <div className="bg-amber-50 px-4 py-2 text-sm text-sand">{notice}<button type="button" className="ml-3 underline" onClick={() => setNotice("")}>닫기</button></div> : null}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <div className="grid min-h-0 flex-1 grid-cols-[200px_minmax(0,1fr)_320px]">
          <Palette onNotice={setNotice} />
          <Canvas
            menu={menu}
            setMenu={setMenu}
            renaming={renaming}
            setRenaming={setRenaming}
            onAskDeleteTab={(uid) => {
              useEditorStore.getState().select({ kind: "tab", uid });
              requestDelete();
            }}
            onAskDeleteGroup={(uid) => {
              useEditorStore.getState().select({ kind: "group", uid });
              requestDelete();
            }}
          />
          <Properties
            onDelete={requestDelete}
            onIcon={() => setIcon(true)}
            onNewMacro={(key) => setNewMacro({ key })}
          />
        </div>
        <DragOverlay />
      </DndContext>
      <BottomPanel
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
        onImport={() => setXmlIn(true)}
        onExport={() => setXmlOut(true)}
      />
      <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.xlsb,.xlam" hidden onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (file) void useEditorStore.getState().openFile(file).catch((err) => setNotice(err instanceof Error ? err.message : "열기 실패"));
      }} />
      <ContextMenu
        menu={menu}
        onClose={() => setMenu(null)}
        onRename={() => { if (menu && menu.kind !== "control") setRenaming({ kind: menu.kind, uid: menu.uid }); }}
        onDuplicate={() => {
          if (menu?.kind === "tab") useEditorStore.getState().duplicateTab(menu.uid);
          if (menu?.kind === "group") useEditorStore.getState().duplicateGroup(menu.uid);
          if (menu?.kind === "control") useEditorStore.getState().duplicateControl(menu.uid);
        }}
        onDelete={() => {
          if (!menu) return;
          useEditorStore.getState().select({ kind: menu.kind, uid: menu.uid });
          requestDelete();
        }}
      />
      {help ? <HelpModal onClose={() => setHelp(false)} /> : null}
      {macroManager ? (
        <MacroManager
          onClose={() => setMacroManager(false)}
          onCreate={() => { setMacroManager(false); setNewMacro({ key: "" }); }}
        />
      ) : null}
      {newMacro ? <NewMacroModal target={newMacro.key || undefined} onClose={() => setNewMacro(null)} /> : null}
      {xmlIn ? <XmlImportModal onClose={() => setXmlIn(false)} /> : null}
      {xmlOut ? <XmlExportModal onClose={() => setXmlOut(false)} onGoto={(uid) => {
        const s = useEditorStore.getState();
        if (s.ribbon.tabs.some((t) => t.uid === uid)) s.select({ kind: "tab", uid });
        else if (findGroup(s.ribbon, uid)) s.select({ kind: "group", uid });
        else s.select({ kind: "control", uid });
        setXmlOut(false);
      }} /> : null}
      {icon && useEditorStore.getState().selection.kind === "control" ? (
        <IconModal
          controlUid={(useEditorStore.getState().selection as { uid: string }).uid}
          onClose={() => setIcon(false)}
        />
      ) : null}
      {confirm ? <ConfirmModal message={confirm.message} onNo={() => setConfirm(null)} onYes={() => { confirm.run(); setConfirm(null); }} /> : null}
      {issues ? (
        <IssuesModal
          issues={issues}
          onClose={() => setIssues(null)}
          onContinue={issues.some((i) => i.level === "error") ? undefined : () => { setIssues(null); void saveNow(); }}
          onGoto={(uid) => {
            const s = useEditorStore.getState();
            if (s.ribbon.tabs.some((t) => t.uid === uid)) s.select({ kind: "tab", uid });
            else if (findGroup(s.ribbon, uid)) s.select({ kind: "group", uid });
            else s.select({ kind: "control", uid });
            setIssues(null);
          }}
        />
      ) : null}
      {saved ? <SavedModal fileName={saved.name} includeVba={saved.includeVba} hasCallback={saved.hasCallback} appendedModule={saved.appendedModule} savedPath={saved.savedPath} onClose={() => setSaved(null)} /> : null}
    </div>
  );
}

function groupUidFromOver(oid: string, ribbon: { tabs: { groups: { uid: string; kind: string; controls?: { uid: string }[] }[] }[] }): string | null {
  if (oid.startsWith("group:")) return oid.slice(6);
  if (oid.startsWith("control:")) {
    const uid = oid.slice(8);
    const found = findControl(ribbon as never, uid);
    return found?.group.uid ?? null;
  }
  return null;
}

function tabUidFromOver(oid: string, ribbon: { tabs: { uid: string; groups: { uid: string }[] }[] }): string | null {
  if (oid.startsWith("tab-body:")) return oid.slice(9);
  if (oid.startsWith("tab:")) return oid.slice(4);
  if (oid.startsWith("group:")) return findGroup(ribbon as never, oid.slice(6))?.tab.uid ?? null;
  if (oid.startsWith("control:")) return findControl(ribbon as never, oid.slice(8))?.tab.uid ?? null;
  return ribbon.tabs[0]?.uid ?? null;
}
