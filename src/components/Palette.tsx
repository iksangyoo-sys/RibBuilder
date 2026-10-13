import { useDraggable } from "@dnd-kit/core";
import { PALETTE_ITEMS } from "@/constants/controls";
import { BUILTIN_GROUPS } from "@/constants/idMso";
import type { ControlType } from "@/model/types";
import type { BuiltinGroupId } from "@/constants/idMso";
import { useEditorStore } from "@/store/useEditorStore";

function PalItem({ id, mark, name, onAdd }: { id: string; mark: string; name: string; onAdd: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex cursor-grab items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-mist ${isDragging ? "opacity-50" : ""}`}
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#f3ead8] text-xs font-bold text-[#8a7350]">{mark}</span>
      <button type="button" className="flex-1 text-left text-sm" onClick={(e) => { e.stopPropagation(); onAdd(); }}>{name}</button>
    </div>
  );
}

export function Palette({ onNotice }: { onNotice: (msg: string) => void }) {
  return (
    <aside className="flex min-h-0 flex-col border-r border-line bg-card">
      <h2 className="px-3 pt-3 text-sm font-bold">리본 요소</h2>
      <div className="min-h-0 flex-1 overflow-auto px-2 pb-3 pt-2">
        {PALETTE_ITEMS.map((d) => (
          <PalItem
            key={d.type}
            id={`palette-control:${d.type}`}
            mark={d.mark}
            name={d.name}
            onAdd={() => {
              const err = useEditorStore.getState().addControlToSelection(d.type);
              if (err) onNotice(err);
            }}
          />
        ))}
        <details className="mt-3" data-testid="builtin-groups">
          <summary className="block w-full cursor-pointer list-none rounded-lg border border-line bg-paper px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
            <span className="flex w-full items-center justify-between">
              <span>내장 그룹</span>
              <span className="text-mute [[open]_&]:rotate-180">▼</span>
            </span>
          </summary>
          <div className="mt-1 rounded-lg border border-line bg-card py-1 shadow-sm" data-testid="builtin-group-list">
            {BUILTIN_GROUPS.map((g) => (
              <PalItem
                key={g.idMso}
                id={`palette-builtin:${g.idMso}`}
                mark="내"
                name={`${g.displayName} · ${g.hint}`}
                onAdd={() => {
                  const err = useEditorStore.getState().addBuiltinToSelection(g.idMso);
                  if (err) onNotice(err);
                }}
              />
            ))}
          </div>
        </details>
      </div>
    </aside>
  );
}

export function parsePaletteId(id: string): { type: ControlType } | { builtin: BuiltinGroupId } | null {
  if (id.startsWith("palette-control:")) return { type: id.slice("palette-control:".length) as ControlType };
  if (id.startsWith("palette-builtin:")) return { builtin: id.slice("palette-builtin:".length) as BuiltinGroupId };
  return null;
}
