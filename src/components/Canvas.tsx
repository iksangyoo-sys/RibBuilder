import { useDroppable } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useCallback, useEffect, useRef, useState } from "react";
import { CONTROL_DEFS } from "@/constants/controls";
import { builtinGroupsOf } from "@/constants/idMso";
import type { Control, CustomGroup, Group, Tab } from "@/model/types";
import { useEditorStore } from "@/store/useEditorStore";

export type MenuState =
  | { kind: "tab"; uid: string; x: number; y: number }
  | { kind: "group"; uid: string; x: number; y: number }
  | { kind: "control"; uid: string; x: number; y: number }
  | null;

type Props = {
  menu: MenuState;
  setMenu: (m: MenuState) => void;
  renaming: { kind: "tab" | "group"; uid: string } | null;
  setRenaming: (v: { kind: "tab" | "group"; uid: string } | null) => void;
  onAskDeleteTab: (uid: string) => void;
  onAskDeleteGroup: (uid: string) => void;
};

export function Canvas(props: Props) {
  const tabs = useEditorStore((s) => s.ribbon.tabs);
  const selection = useEditorStore((s) => s.selection);
  const select = useEditorStore((s) => s.select);
  const addTab = useEditorStore((s) => s.addTab);
  const addTabAt = useEditorStore((s) => s.addTabAt);
  const addGroup = useEditorStore((s) => s.addGroup);
  const addGroupAt = useEditorStore((s) => s.addGroupAt);
  const strip = tabStrip(tabs);
  const customTabs = tabs.filter((t) => t.kind === "custom");
  const fromSel = selection.kind === "none" ? undefined : tabOfSelection(tabs, selection.uid);
  const activeTab = fromSel ?? customTabs[customTabs.length - 1] ?? tabs.find((t) => t.kind === "builtin");

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-paper">
      <div className="m-3 mb-0 flex min-h-0 flex-1 flex-col rounded-xl border border-line bg-card">
        <div
          className="flex items-stretch overflow-x-auto border-b border-line px-2"
          onContextMenu={(e) => {
            const uid = (e.target as HTMLElement).closest("[data-tab-uid]")?.getAttribute("data-tab-uid");
            if (!uid) return;
            e.preventDefault();
            select({ kind: "tab", uid });
            props.setMenu({ kind: "tab", uid, x: e.clientX, y: e.clientY });
          }}
        >
          <SortableContext items={customTabs.map((t) => `tab:${t.uid}`)} strategy={horizontalListSortingStrategy}>
            {strip.map((item) => item.kind === "gap" ? (
              <InsertGap key={`gap:${item.before}`} variant="tab" label="이 자리에 탭 추가" onAdd={() => addTabAt(item.before)} />
            ) : (
              <TabChip
                key={item.tab.uid}
                tab={item.tab}
                sortable={item.tab.kind === "custom"}
                setMenu={props.setMenu}
                active={activeTab?.uid === item.tab.uid}
                renaming={props.renaming?.kind === "tab" && props.renaming.uid === item.tab.uid}
                onRenameDone={(label) => {
                  if (label.trim()) useEditorStore.getState().renameTab(item.tab.uid, label.trim());
                  props.setRenaming(null);
                }}
                onSelect={() => select({ kind: "tab", uid: item.tab.uid })}
                onContext={(e) => {
                  e.preventDefault();
                  select({ kind: "tab", uid: item.tab.uid });
                  props.setMenu({ kind: "tab", uid: item.tab.uid, x: e.clientX, y: e.clientY });
                }}
                onDouble={() => {
                  if (item.tab.kind === "custom") props.setRenaming({ kind: "tab", uid: item.tab.uid });
                }}
              />
            ))}
          </SortableContext>
          <div className="flex items-center py-2 pl-3">
            <button type="button" className="whitespace-nowrap rounded-lg bg-pine px-4 py-2 text-sm font-bold text-white" onClick={addTab}>+ 탭 추가</button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {activeTab?.kind === "builtin" ? (
            <BuiltinTabBody tab={activeTab} {...props} onAddGroupAt={(before) => addGroupAt(activeTab.uid, before)} />
          ) : activeTab ? (
            <GroupRow tab={activeTab} {...props} onAddGroup={() => addGroup(activeTab.uid)} />
          ) : (
            <p className="text-mute">[+ 탭 추가]로 사용자 탭을 만드세요.</p>
          )}
        </div>
      </div>
    </div>
  );
}

type StripItem = { kind: "tab"; tab: Tab } | { kind: "gap"; before: string };

/** 탭 줄: 기본 탭 순서대로, 사용자 탭은 insertBeforeMso/insertAfterMso 자리에, 나머지는 끝에. 기본 탭 앞마다 끼워 넣을 틈을 둔다. */
function tabStrip(tabs: Tab[]): StripItem[] {
  const customs = tabs.filter((t): t is Extract<Tab, { kind: "custom" }> => t.kind === "custom");
  const builtins = tabs.filter((t) => t.kind === "builtin");
  const placed = new Set<string>();
  const out: StripItem[] = [];
  for (const b of builtins) {
    if (b.kind !== "builtin") continue;
    for (const c of customs) if (c.insertBeforeMso === b.idMso) { out.push({ kind: "tab", tab: c }); placed.add(c.uid); }
    out.push({ kind: "gap", before: b.idMso });
    out.push({ kind: "tab", tab: b });
    for (const c of customs) if (!placed.has(c.uid) && c.insertAfterMso === b.idMso) { out.push({ kind: "tab", tab: c }); placed.add(c.uid); }
  }
  for (const c of customs) if (!placed.has(c.uid)) out.push({ kind: "tab", tab: c });
  return out;
}

/** 마우스를 올리면 "+" 칸으로 벌어지는 틈. 누르면 그 자리에 탭/그룹을 넣는다. */
function InsertGap({ variant, label, onAdd }: { variant: "tab" | "group"; label: string; onAdd: () => void }) {
  if (variant === "tab") {
    return (
      <button
        type="button"
        title={label}
        aria-label={label}
        onClick={onAdd}
        className="group/gap my-2 flex w-2 shrink-0 items-center justify-center overflow-hidden rounded-md border border-dashed border-transparent text-pine transition-all duration-150 hover:mx-1 hover:w-8 hover:border-pine hover:bg-mist"
      >
        <span className="text-lg font-bold opacity-0 group-hover/gap:opacity-100">+</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      data-testid="group-insert-gap"
      onClick={onAdd}
      className="group/gap flex min-h-[180px] w-3 shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-transparent text-pine transition-all duration-150 hover:w-32 hover:border-pine hover:bg-mist"
    >
      <span className="text-2xl font-bold opacity-0 group-hover/gap:opacity-100">+</span>
    </button>
  );
}

function tabOfSelection(tabs: Tab[], uid: string): Tab | undefined {
  for (const tab of tabs) {
    if (tab.uid === uid) return tab;
    if (tab.groups.some((g) => g.uid === uid || (g.kind === "custom" && g.controls.some((c) => containsUid(c, uid))))) return tab;
  }
  return tabs[0];
}

function containsUid(c: Control, uid: string): boolean {
  if (c.uid === uid) return true;
  if (c.type === "menu" || c.type === "splitButton") {
    if (c.items.some((x) => x.uid === uid)) return true;
  }
  if (c.type === "splitButton" && c.button.uid === uid) return true;
  return false;
}

function TabChip({
  tab, active, renaming, onRenameDone, onSelect, onContext, onDouble, sortable, setMenu,
}: {
  tab: Tab; active: boolean; renaming: boolean; sortable: boolean;
  onRenameDone: (v: string) => void;
  onSelect: () => void;
  onContext: (e: React.MouseEvent) => void;
  onDouble: () => void;
  setMenu: (m: MenuState) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: `tab:${tab.uid}`, disabled: !sortable });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    // 끌 수 없는 기본 탭에는 끌기 속성(aria-disabled 등)을 주지 않는다. 주면 탭 자체가 "사용 안 함"으로 읽힌다.
    <div ref={setNodeRef} style={style} {...(sortable ? attributes : {})} {...(sortable ? listeners : {})} data-tab-uid={tab.uid} onContextMenu={onContext} className="group/tab relative flex items-stretch">
      {renaming ? (
        <InlineEdit value={tab.label} onDone={onRenameDone} />
      ) : (
        <>
        <button
          type="button"
          data-tab-uid={tab.uid}
          onClick={onSelect}
          onDoubleClick={onDouble}
          onContextMenu={onContext}
          className={`whitespace-nowrap border-b-[3px] px-3 py-3 text-[15px] ${active ? "border-pine text-pine" : "border-transparent"} ${!active && tab.kind === "custom" ? "font-semibold text-ink" : ""} ${!active && tab.kind === "builtin" ? "text-mute" : ""} ${tab.kind === "builtin" && tab.visible === false ? "line-through" : ""}`}
        >
          {tab.label}
        </button>
        <button
          type="button"
          aria-label={`${tab.label} 메뉴`}
          data-testid={tab.kind === "custom" ? "custom-tab-menu" : "builtin-tab-menu"}
          className="absolute right-0 top-1 px-1 text-xs text-mute opacity-0 group-hover/tab:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onSelect();
            setMenu({ kind: "tab", uid: tab.uid, x: e.clientX, y: e.clientY });
          }}
        >
          ⋯
        </button>
        </>
      )}
    </div>
  );
}

/** 기본 탭: 엑셀의 기본 그룹을 회색 칸으로 보여 주고, 그 사이·끝에 사용자 그룹을 넣을 수 있게 한다. */
function BuiltinTabBody({ tab, onAddGroupAt, renaming, setRenaming, setMenu, onAskDeleteGroup }: Props & { tab: Tab; onAddGroupAt: (beforeMso?: string) => void }) {
  if (tab.kind !== "builtin") return null;
  const base = builtinGroupsOf(tab.idMso);
  const ids = new Set(base.map((g) => g.idMso));
  const slotOf = (g: Group): number => {
    if (g.kind !== "custom") return base.length;
    if (g.insertBeforeMso && ids.has(g.insertBeforeMso)) return base.findIndex((b) => b.idMso === g.insertBeforeMso);
    if (g.insertAfterMso && ids.has(g.insertAfterMso)) return base.findIndex((b) => b.idMso === g.insertAfterMso) + 1;
    return base.length;
  };
  const card = (group: Group) => (
    <GroupCard
      key={group.uid}
      group={group}
      setMenu={setMenu}
      renaming={renaming?.kind === "group" && renaming.uid === group.uid}
      onRenameDone={(label) => {
        if (label.trim()) useEditorStore.getState().renameGroup(group.uid, label.trim());
        setRenaming(null);
      }}
      onDouble={() => {
        if (group.kind === "custom") setRenaming({ kind: "group", uid: group.uid });
      }}
      onContext={(e) => {
        e.preventDefault();
        useEditorStore.getState().select({ kind: "group", uid: group.uid });
        setMenu({ kind: "group", uid: group.uid, x: e.clientX, y: e.clientY });
      }}
      onAskDelete={() => onAskDeleteGroup(group.uid)}
    />
  );
  return (
    <div className="flex items-stretch gap-1">
      <SortableContext items={tab.groups.map((g) => `group:${g.uid}`)} strategy={horizontalListSortingStrategy}>
        {base.map((b, i) => (
          <div key={b.idMso} className="flex items-stretch gap-1">
            {tab.groups.filter((g) => slotOf(g) === i).map(card)}
            <InsertGap variant="group" label={`${b.label} 앞에 그룹 추가`} onAdd={() => onAddGroupAt(b.idMso)} />
            <div className="flex min-h-[180px] w-32 shrink-0 flex-col rounded-lg border border-dashed border-line/70 bg-paper/60 text-mute/60" title={`${b.label} (${b.idMso}) — 엑셀 기본 그룹`}>
              <div className="flex flex-1 items-center justify-center text-sm">기본</div>
              <div className="border-t border-line/60 px-1 py-2 text-center text-xs font-semibold">{b.label}</div>
            </div>
          </div>
        ))}
        {tab.groups.filter((g) => slotOf(g) === base.length).map(card)}
      </SortableContext>
      <button type="button" aria-label="그룹 추가" onClick={() => onAddGroupAt(undefined)} className="ml-3 min-h-[180px] w-24 shrink-0 rounded-lg border-2 border-dashed border-line text-2xl text-mute hover:border-pine hover:text-pine">+</button>
    </div>
  );
}

function GroupRow({ tab, onAddGroup, renaming, setRenaming, setMenu, onAskDeleteGroup }: Props & { tab: Tab; onAddGroup: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `tab-body:${tab.uid}` });
  return (
    <div ref={setNodeRef} className={`flex flex-wrap gap-3 ${isOver ? "rounded-xl bg-mist" : ""}`}>
      <SortableContext items={tab.groups.map((g) => `group:${g.uid}`)} strategy={horizontalListSortingStrategy}>
        {tab.groups.map((group) => (
          <GroupCard
            key={group.uid}
            group={group}
            setMenu={setMenu}
            renaming={renaming?.kind === "group" && renaming.uid === group.uid}
            onRenameDone={(label) => {
              if (label.trim()) useEditorStore.getState().renameGroup(group.uid, label.trim());
              setRenaming(null);
            }}
            onDouble={() => {
              if (group.kind === "custom") setRenaming({ kind: "group", uid: group.uid });
            }}
            onContext={(e) => {
              e.preventDefault();
              useEditorStore.getState().select({ kind: "group", uid: group.uid });
              setMenu({ kind: "group", uid: group.uid, x: e.clientX, y: e.clientY });
            }}
            onAskDelete={() => onAskDeleteGroup(group.uid)}
          />
        ))}
      </SortableContext>
      <button type="button" aria-label="그룹 추가" onClick={onAddGroup} className="min-h-[140px] w-16 rounded-xl border border-dashed border-leaf text-2xl text-leaf">+</button>
    </div>
  );
}

function GroupCard({
  group, renaming, onRenameDone, onContext, onDouble, setMenu,
}: {
  group: Group; renaming: boolean;
  onRenameDone: (v: string) => void;
  onContext: (e: React.MouseEvent) => void;
  onDouble: () => void;
  onAskDelete: () => void;
  setMenu: (m: MenuState) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: `group:${group.uid}` });
  const { setNodeRef: setDrop, isOver } = useDroppable({ id: `group:${group.uid}` });
  const selected = useEditorStore((s) => s.selection.kind === "group" && s.selection.uid === group.uid);
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div
      ref={(node) => { setNodeRef(node); setDrop(node); }}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => useEditorStore.getState().select({ kind: "group", uid: group.uid })}
      onContextMenu={onContext}
      className={`flex w-44 min-h-[140px] flex-col rounded-xl border bg-card p-2 ${group.kind === "builtin" ? "border-sand bg-paper" : "border-line"} ${selected ? "ring-2 ring-leaf" : ""} ${isOver ? "bg-mist" : ""}`}
    >
      {group.kind === "builtin" ? (
        <>
          <div className="text-xs text-mute">잠금 · 내장</div>
          <div className="flex flex-1 flex-col items-center justify-center gap-1 text-mute">
            <span className="rounded bg-sand/40 px-2 py-1 text-xs">엑셀 기본 단추</span>
            <span className="text-sm font-semibold text-ink">{group.displayName}</span>
          </div>
        </>
      ) : (
        <>
          <div className="min-h-20 flex-1">
            <ControlLane group={group} onControlMenu={(uid, x, y) => {
              useEditorStore.getState().select({ kind: "control", uid });
              setMenu({ kind: "control", uid, x, y });
            }} />
          </div>
          {renaming ? <InlineEdit value={group.label} onDone={onRenameDone} /> : (
            <div className="pt-2 text-center text-sm" onDoubleClick={onDouble}>{group.label}</div>
          )}
        </>
      )}
    </div>
  );
}

function ControlLane({ group, onControlMenu }: { group: CustomGroup; onControlMenu?: (uid: string, x: number, y: number) => void }) {
  if (!group.controls.length) {
    return <div className="grid h-full place-items-center text-xs text-mute">드래그 추가</div>;
  }
  const chunks = layout(group.controls);
  return (
    <SortableContext items={group.controls.map((c) => `control:${c.uid}`)}>
      <div className="flex flex-wrap gap-1">
        {chunks.map((chunk, i) =>
          chunk.kind === "stack" ? (
            <div key={i} className="flex flex-col gap-0.5">
              {chunk.items.map((c) => <ControlChip key={c.uid} control={c} onMenu={onControlMenu} />)}
            </div>
          ) : (
            <ControlChip key={chunk.item.uid} control={chunk.item} large={chunk.item.size === "large"} onMenu={onControlMenu} />
          ),
        )}
      </div>
    </SortableContext>
  );
}

function layout(controls: Control[]): ({ kind: "stack"; items: Control[] } | { kind: "single"; item: Control })[] {
  const out: ({ kind: "stack"; items: Control[] } | { kind: "single"; item: Control })[] = [];
  let stack: Control[] = [];
  const flush = () => {
    if (stack.length) out.push({ kind: "stack", items: stack });
    stack = [];
  };
  for (const c of controls) {
    if (c.type === "separator" || c.size === "large") {
      flush();
      out.push({ kind: "single", item: c });
    } else {
      stack.push(c);
      if (stack.length === 3) flush();
    }
  }
  flush();
  return out;
}

function ControlChip({ control, large, onMenu }: { control: Control; large?: boolean; onMenu?: (uid: string, x: number, y: number) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: `control:${control.uid}` });
  const selected = useEditorStore((s) => s.selection.kind === "control" && s.selection.uid === control.uid);
  const images = useEditorStore((s) => s.images);
  const style = { transform: CSS.Transform.toString(transform), transition };
  const def = CONTROL_DEFS.find((d) => d.type === control.type);
  const img = images.find((i) => i.id === control.imageId);
  const caption = control.type === "splitButton" ? control.button.label : control.label;
  const hasItems = control.type === "dropDown" || control.type === "comboBox" || control.type === "menu" || control.type === "splitButton";
  const [popup, setPopup] = useState<{ x: number; y: number } | null>(null);
  const chipRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const setRefs = useCallback((el: HTMLButtonElement | null) => {
    setNodeRef(el);
    chipRef.current = el;
  }, [setNodeRef]);

  useEffect(() => {
    if (!popup) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!chipRef.current?.contains(t) && !popupRef.current?.contains(t)) setPopup(null);
    };
    const onScroll = () => setPopup(null);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [popup]);

  useEffect(() => {
    if (!selected) setPopup(null);
  }, [selected]);

  const chip = (
    <button
      ref={setRefs}
      style={style}
      {...attributes}
      {...listeners}
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        useEditorStore.getState().select({ kind: "control", uid: control.uid });
        if (hasItems) {
          const r = e.currentTarget.getBoundingClientRect();
          setPopup((p) => (p ? null : { x: r.left, y: r.bottom + 4 }));
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setPopup(null);
        onMenu?.(control.uid, e.clientX, e.clientY);
      }}
      className={`flex ${large ? "min-w-12 flex-col items-center" : "min-w-10 flex-row items-center gap-1"} rounded-md px-1 py-0.5 ${selected ? "bg-mist ring-1 ring-leaf" : ""}`}
    >
      {control.type === "separator" ? <span className="mx-1 h-10 w-px bg-line" /> : (
        <>
          {img ? <img src={img.dataUrl} alt="" className="h-5 w-5 object-contain" /> : <span className="grid h-5 w-5 place-items-center rounded bg-pine text-[10px] text-white">{def?.mark}</span>}
          <span className="max-w-16 truncate text-[10px]">{caption}</span>
          {hasItems ? <span className="text-[9px] leading-none text-mute">▾</span> : null}
        </>
      )}
    </button>
  );
  if (!hasItems || !popup) return chip;
  const items = control.items as { uid: string; id: string; label: string }[];
  return (
    <>
      {chip}
      {/* 엑셀에서 드롭다운을 펼친 모습처럼 항목을 보여준다. 메뉴 항목은 누르면 그 단추를 선택한다. */}
      <div
        ref={popupRef}
        data-testid="control-item-preview"
        style={{ left: Math.min(popup.x, window.innerWidth - 220), top: Math.min(popup.y, window.innerHeight - 40) }}
        className="fixed z-30 max-h-72 min-w-44 overflow-auto rounded-lg border border-line bg-card py-1 text-sm shadow-lg"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {items.length ? items.map((it) => (
          <button
            key={it.uid}
            type="button"
            className="flex w-full items-center gap-3 px-4 py-1.5 text-left hover:bg-mist"
            onClick={() => {
              if (control.type === "menu" || control.type === "splitButton") useEditorStore.getState().select({ kind: "control", uid: it.uid });
              setPopup(null);
            }}
          >
            <span className="text-xs text-mute">·</span>
            <span>{it.label || it.id || "(이름 없음)"}</span>
          </button>
        )) : <p className="px-4 py-1.5 text-mute">항목이 없습니다. 속성 패널에서 추가하세요.</p>}
      </div>
    </>
  );
}

function InlineEdit({ value, onDone }: { value: string; onDone: (v: string) => void }) {
  const [text, setText] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return (
    <input
      ref={ref}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onDone(text)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onDone(text);
        if (e.key === "Escape") onDone(value);
      }}
      className="w-28 rounded border border-leaf px-1 py-0.5"
    />
  );
}

export function ContextMenu({
  menu, onClose, onRename, onDuplicate, onDelete,
}: {
  menu: MenuState;
  onClose: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const hide = () => { if (menu?.kind === "tab") useEditorStore.getState().hideBuiltinTab(menu.uid); };
  const clear = () => { if (menu?.kind === "tab") useEditorStore.getState().clearBuiltinGroups(menu.uid); };
  const copy = () => useEditorStore.getState().copySelection();
  const cut = () => useEditorStore.getState().cutSelection();
  const paste = () => useEditorStore.getState().pasteSelection();
  const size = () => { if (menu?.kind === "control") useEditorStore.getState().toggleControlSize(menu.uid); };
  const ref = useRef<HTMLDivElement>(null);
  const tabs = useEditorStore((s) => s.ribbon.tabs);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onScroll = () => onClose();
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);
  if (!menu) return null;
  const tab = menu.kind === "tab" ? tabs.find((t) => t.uid === menu.uid) : undefined;
  const found = menu.kind === "group" ? tabs.flatMap((t) => t.groups.map((g) => ({ g, t }))).find((x) => x.g.uid === menu.uid) : undefined;
  const builtinTab = tab?.kind === "builtin";
  const builtinGroup = found?.g.kind === "builtin";
  const x = Math.min(menu.x, window.innerWidth - 200);
  const y = Math.min(menu.y, window.innerHeight - 180);
  const items = menu.kind === "tab"
    ? builtinTab
      ? [
          { label: tab?.visible === false ? "이 탭 보이기" : "이 탭 숨기기", run: hide },
          { label: "사용자 그룹 모두 제거", run: clear },
        ]
      : [
          { label: "이름 변경", run: onRename },
          { label: "복제", run: onDuplicate },
          { sep: true },
          { label: "삭제", run: onDelete, danger: true },
        ]
    : menu.kind === "control"
      ? [
          { label: "복제", run: onDuplicate },
          { label: "잘라내기", run: cut },
          { label: "복사", run: copy },
          { label: "붙여넣기", run: paste },
          { label: "크기 전환", run: size },
          { sep: true },
          { label: "삭제", run: onDelete, danger: true },
        ]
      : [
          { label: "이름 변경", run: onRename, disabled: builtinGroup },
          { label: "복제", run: onDuplicate, disabled: builtinGroup },
          { sep: true },
          { label: "삭제", run: onDelete, danger: true },
        ];
  return (
    <div ref={ref} role="menu" data-testid="context-menu" style={{ left: x, top: y }} className="fixed z-30 min-w-40 rounded-lg border border-line bg-card py-1 shadow-lg">
      {items.map((it, i) =>
        "sep" in it && it.sep ? <hr key={i} className="my-1 border-line" /> : (
          <button
            key={i}
            type="button"
            data-action={(it as { label?: string }).label}
            disabled={Boolean((it as { disabled?: boolean }).disabled)}
            onClick={() => { (it as { run: () => void }).run(); onClose(); }}
            className={`block w-full px-3 py-1.5 text-left disabled:opacity-40 ${(it as { danger?: boolean }).danger ? "text-clay" : ""}`}
          >
            {(it as { label: string }).label}
          </button>
        ),
      )}
    </div>
  );
}
