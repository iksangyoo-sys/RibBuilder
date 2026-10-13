import { useDroppable } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useRef, useState } from "react";
import { CONTROL_DEFS } from "@/constants/controls";
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
  const addGroup = useEditorStore((s) => s.addGroup);
  const customTabs = orderedTabs(tabs).filter((t) => t.kind === "custom");
  const fromSel = selection.kind === "none" ? undefined : tabOfSelection(tabs, selection.uid);
  const activeTab = fromSel?.kind === "custom" ? fromSel : customTabs[customTabs.length - 1];

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-paper">
      <div
        className="flex items-end gap-1 overflow-x-auto border-b border-line px-3 pt-3"
        onContextMenu={(e) => {
          const uid = (e.target as HTMLElement).closest("[data-tab-uid]")?.getAttribute("data-tab-uid");
          if (!uid) return;
          e.preventDefault();
          select({ kind: "tab", uid });
          props.setMenu({ kind: "tab", uid, x: e.clientX, y: e.clientY });
        }}
      >
        <SortableContext items={customTabs.map((t) => `tab:${t.uid}`)} strategy={horizontalListSortingStrategy}>
          {customTabs.map((tab) => (
            <TabChip
              key={tab.uid}
              tab={tab}
              sortable
              setMenu={props.setMenu}
              active={activeTab?.uid === tab.uid}
              renaming={props.renaming?.kind === "tab" && props.renaming.uid === tab.uid}
              onRenameDone={(label) => {
                if (label.trim()) useEditorStore.getState().renameTab(tab.uid, label.trim());
                props.setRenaming(null);
              }}
              onSelect={() => select({ kind: "tab", uid: tab.uid })}
              onContext={(e) => {
                e.preventDefault();
                select({ kind: "tab", uid: tab.uid });
                props.setMenu({ kind: "tab", uid: tab.uid, x: e.clientX, y: e.clientY });
              }}
              onDouble={() => {
                props.setRenaming({ kind: "tab", uid: tab.uid });
              }}
            />
          ))}
        </SortableContext>
        <button type="button" className="mb-1 rounded-full bg-leaf px-3 py-1.5 text-sm font-semibold text-white" onClick={addTab}>+ 탭 추가</button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {activeTab ? (
          <GroupRow
            tab={activeTab}
            {...props}
            onAddGroup={() => addGroup(activeTab.uid)}
          />
        ) : (
          <p className="text-mute">[+ 탭 추가]로 사용자 탭을 만드세요.</p>
        )}
      </div>
    </div>
  );
}

function orderedTabs(tabs: Tab[]): Tab[] {
  const customs = tabs.filter((t) => t.kind === "custom");
  const builtins = tabs.filter((t) => t.kind === "builtin");
  const used = new Set<string>();
  const out: Tab[] = [];
  for (const b of builtins) {
    out.push(b);
    for (const c of customs) {
      if (c.kind === "custom" && c.insertAfterMso === b.idMso) {
        out.push(c);
        used.add(c.uid);
      }
    }
  }
  for (const c of customs) if (!used.has(c.uid)) out.push(c);
  return out;
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
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} data-tab-uid={tab.uid} onContextMenu={onContext} className="flex items-end">
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
          className={`rounded-t-lg px-2 py-1.5 text-sm whitespace-nowrap ${tab.kind === "custom" ? "text-pine font-bold" : "text-mute"} ${tab.kind === "builtin" && tab.visible === false ? "line-through" : ""} ${active ? "bg-card border border-b-0 border-line shadow-[inset_0_-2px_0_#3c8a5c]" : ""}`}
        >
          {tab.label}
        </button>
        <button
          type="button"
          aria-label={`${tab.label} 메뉴`}
          data-testid={tab.kind === "custom" ? "custom-tab-menu" : "builtin-tab-menu"}
          className="mb-1 px-1 text-mute"
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
  return (
    <button
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      type="button"
      onClick={(e) => { e.stopPropagation(); useEditorStore.getState().select({ kind: "control", uid: control.uid }); }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onMenu?.(control.uid, e.clientX, e.clientY);
      }}
      className={`flex ${large ? "min-w-12 flex-col items-center" : "min-w-10 flex-row items-center gap-1"} rounded-md px-1 py-0.5 ${selected ? "bg-mist ring-1 ring-leaf" : ""}`}
    >
      {control.type === "separator" ? <span className="mx-1 h-10 w-px bg-line" /> : (
        <>
          {img ? <img src={img.dataUrl} alt="" className="h-5 w-5 object-contain" /> : <span className="grid h-5 w-5 place-items-center rounded bg-pine text-[10px] text-white">{def?.mark}</span>}
          <span className="max-w-16 truncate text-[10px]">{caption}</span>
        </>
      )}
    </button>
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
