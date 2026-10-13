import { BUILTIN_TABS } from "@/constants/idMso";
import { CONTROL_NAME } from "@/constants/controls";
import type { Control, ListItem } from "@/model/types";
import { findControl, findGroup, findTab } from "@/model/walk";
import { IdIssuer } from "@/model/ids";
import { allXmlIds } from "@/model/walk";
import { isXmlId } from "@/model/ids";
import { createButton, createItem } from "@/model/factory";
import { useEditorStore } from "@/store/useEditorStore";
import { useState } from "react";

type Props = { onDelete: () => void; onIcon: () => void; onNewMacro: () => void };

export function Properties({ onDelete, onIcon, onNewMacro }: Props) {
  const selection = useEditorStore((s) => s.selection);
  return (
    <aside className="flex min-h-0 flex-col border-l border-line bg-card">
      <div className="flex items-center justify-between px-4 pt-3">
        <h2 className="text-sm font-bold">속성</h2>
        {selection.kind !== "none" ? <button type="button" className="text-sm text-clay" onClick={onDelete}>삭제</button> : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
        {selection.kind === "none" ? (
          <p className="py-3 text-sm text-mute">요소를 선택하면 속성이 표시됩니다</p>
        ) : null}
        {selection.kind === "tab" ? <TabProps uid={selection.uid} /> : null}
        {selection.kind === "group" ? <GroupProps uid={selection.uid} /> : null}
        {selection.kind === "control" ? <ControlProps uid={selection.uid} onIcon={onIcon} onNewMacro={onNewMacro} /> : null}
      </div>
    </aside>
  );
}

function Card({ title, extra, children }: { title: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold">{title}</h3>
        {extra}
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="mb-3 block text-sm">
      <span className="mb-1 block font-semibold">{label}</span>
      {hint ? <span className="mb-1 block text-xs text-mute">{hint}</span> : null}
      {children}
    </label>
  );
}

function TabProps({ uid }: { uid: string }) {
  const ribbon = useEditorStore((s) => s.ribbon);
  const tab = findTab(ribbon, uid);
  const patchTab = useEditorStore((s) => s.patchTab);
  if (!tab) return null;
  if (tab.kind === "builtin") {
    return (
      <Card title="기본 탭">
        <p className="text-sm text-mute">{tab.label} ({tab.idMso})</p>
      </Card>
    );
  }
  return (
    <Card title="사용자 탭">
      <IdField value={tab.id} onChange={(id) => patchTab(uid, { id })} />
      <Field label="레이블"><input className="w-full rounded border border-line bg-white px-2 py-1.5" value={tab.label} onChange={(e) => patchTab(uid, { label: e.target.value })} /></Field>
      <Field label="keytip"><input className="w-full rounded border border-line bg-white px-2 py-1.5" maxLength={3} value={tab.keytip} onChange={(e) => patchTab(uid, { keytip: e.target.value })} /></Field>
      <Field label="위치 (insertAfterMso)">
        <select className="w-full rounded border border-line bg-white px-2 py-1.5" value={tab.insertAfterMso} onChange={(e) => patchTab(uid, { insertAfterMso: e.target.value, insertBeforeMso: "" })}>
          <option value="">(없음)</option>
          {BUILTIN_TABS.map((t) => <option key={t.idMso} value={t.idMso}>{t.label} 뒤</option>)}
        </select>
      </Field>
    </Card>
  );
}

function GroupProps({ uid }: { uid: string }) {
  const ribbon = useEditorStore((s) => s.ribbon);
  const found = findGroup(ribbon, uid);
  const patchGroup = useEditorStore((s) => s.patchGroup);
  if (!found) return null;
  if (found.group.kind === "builtin") {
    return <Card title="내장 그룹"><p className="text-sm text-mute">{found.group.displayName} ({found.group.idMso}) 은 잠겨 있습니다. 순서 이동과 삭제만 됩니다.</p></Card>;
  }
  return (
    <Card title="그룹">
      <IdField value={found.group.id} onChange={(id) => patchGroup(uid, { id })} />
      <Field label="레이블"><input className="w-full rounded border border-line bg-white px-2 py-1.5" value={found.group.label} onChange={(e) => patchGroup(uid, { label: e.target.value })} /></Field>
    </Card>
  );
}

function ControlProps({ uid, onIcon, onNewMacro }: { uid: string; onIcon: () => void; onNewMacro: () => void }) {
  const ribbon = useEditorStore((s) => s.ribbon);
  const macros = useEditorStore((s) => s.macros);
  const images = useEditorStore((s) => s.images);
  const found = findControl(ribbon, uid);
  const patch = useEditorStore((s) => s.patchControl);
  if (!found) return null;
  const c = found.control;
  const set = (p: Partial<Control>) => patch(uid, p);
  if (c.type === "unknown") {
    return <Card title="알 수 없는 요소"><p className="text-xs text-mute">가져온 XML을 그대로 보존합니다.</p><pre className="overflow-auto text-xs">{c.rawXml}</pre></Card>;
  }
  if (c.type === "separator") {
    return <Card title="구분선"><IdField value={c.id} onChange={(id) => set({ id })} /></Card>;
  }
  const showIcon = c.type !== "checkBox" && c.type !== "labelControl";
  const showSize = c.type === "button" || c.type === "toggleButton" || c.type === "menu" || c.type === "splitButton";
  const showWidth = c.type === "editBox" || c.type === "comboBox";
  const img = images.find((i) => i.id === c.imageId);
  const iconLabel = c.imageId ? (img?.name || `내 이미지 ${c.imageId}`) : c.imageMso || "선택 안 함";
  return (
    <>
      <Card title={CONTROL_NAME[c.type] ?? c.type}>
        <IdField value={c.id} onChange={(id) => set({ id })} />
        {c.type !== "splitButton" ? (
          <Field label="레이블"><input className="w-full rounded border border-line bg-white px-2 py-1.5" value={c.label} onChange={(e) => set({ label: e.target.value })} /></Field>
        ) : (
          <Field label="주 버튼 레이블">
            <input className="w-full rounded border border-line bg-white px-2 py-1.5" value={c.button.label} onChange={(e) => patch(uid, { button: { ...c.button, label: e.target.value } } as Partial<Control>)} />
          </Field>
        )}
        {showIcon ? (
          <div className="mb-3">
            <div className="mb-1 text-sm font-semibold">아이콘</div>
            <button type="button" className="flex w-full items-center gap-2 rounded border border-line bg-white px-2 py-1.5 text-left" onClick={onIcon}>
              {img ? (
                <img src={img.dataUrl} alt="" className="h-5 w-5 object-contain" />
              ) : (
                <span className="grid h-5 w-5 place-items-center rounded-full bg-[#f3ead8] text-[10px] font-bold text-[#8a7350]">
                  {c.imageMso ? (c.imageMso[0] ?? "?") : "?"}
                </span>
              )}
              <span className={c.imageMso || c.imageId ? "" : "text-mute"}>{iconLabel}</span>
            </button>
          </div>
        ) : null}
        {showSize ? (
          <Field label="크기">
            <select className="w-full rounded border border-line bg-white px-2 py-1.5" value={c.size} onChange={(e) => set({ size: e.target.value as "large" | "normal" })}>
              <option value="large">Large</option>
              <option value="normal">Normal</option>
            </select>
          </Field>
        ) : null}
      </Card>
      <Card title="콜백 (VBA)">
        <MacroField control={c} macros={macros} onNew={onNewMacro} onChange={(key, value) => set({ [key]: value } as Partial<Control>)} />
      </Card>
      {showWidth ? (
        <Field label="너비 (글자 수)" hint="엑셀은 sizeString으로 입력칸 너비를 정합니다. 비우면 기본 너비를 씁니다.">
          <input
            className="w-full rounded border border-line bg-white px-2 py-1.5"
            value={c.type === "editBox" || c.type === "comboBox" ? c.maxLength : ""}
            onChange={(e) => {
              const n = e.target.value.replace(/[^\d]/g, "");
              const sizeString = n ? "W".repeat(Math.min(40, Number(n) || 0)) : c.type === "editBox" ? "WWWWWWWWWWWW" : "";
              set({ maxLength: n, sizeString } as Partial<Control>);
            }}
          />
        </Field>
      ) : null}
      {c.type === "comboBox" || c.type === "dropDown" ? <ItemEditor control={c} /> : null}
      {c.type === "menu" || c.type === "splitButton" ? <Card title="하위 항목"><ChildEditor control={c} /></Card> : null}
    </>
  );
}

function IdField({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState(value);
  const ids = allXmlIds(useEditorStore.getState().ribbon);
  const err = !isXmlId(draft) ? "식별자 규칙에 맞지 않습니다." : (draft !== value && ids.includes(draft) ? "이미 있는 id입니다." : "");
  return (
    <Field label="id" hint="VBA 매크로에서 이 이름을 참조합니다 (필요시에만 수정)">
      {edit ? (
        <div>
          <input className="w-full rounded border border-line bg-white px-2 py-1.5" value={draft} onChange={(e) => setDraft(e.target.value)} />
          {err ? <p className="text-xs text-clay">{err}</p> : null}
          <button type="button" className="mt-1 text-sm underline" disabled={Boolean(err)} onClick={() => { onChange(draft); setEdit(false); }}>적용</button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="flex-1 rounded border border-line bg-mist px-2 py-1.5 text-mute">{value}</span>
          <button type="button" className="text-sm text-mute" onClick={() => { setDraft(value); setEdit(true); }}>편집</button>
        </div>
      )}
    </Field>
  );
}

function MacroField({
  control, macros, onNew, onChange,
}: {
  control: Control;
  macros: { name: string }[];
  onNew: () => void;
  onChange: (key: string, value: string) => void;
}) {
  const fields: { key: string; label: string; value: string }[] = [];
  if (control.type === "button") {
    fields.push({ key: "onAction", label: "onAction — 버튼을 눌렀을 때 호출", value: control.onAction });
  }
  if (control.type === "toggleButton") {
    fields.push({ key: "onAction", label: "onAction — 토글 상태가 바뀔 때 호출 (pressed=True/False)", value: control.onAction });
    fields.push({ key: "getPressed", label: "getPressed — 리본이 그려질 때 초기 눌림 상태", value: control.getPressed });
  }
  if (control.type === "checkBox") {
    fields.push({ key: "onAction", label: "onAction — 체크 상태가 바뀔 때 호출 (pressed=True/False)", value: control.onAction });
    fields.push({ key: "getPressed", label: "getPressed — 리본이 그려질 때 초기 체크 상태", value: control.getPressed });
  }
  if (control.type === "editBox" || control.type === "comboBox") {
    fields.push({ key: "onChange", label: "onChange — 값이 바뀔 때 호출 (text=문자열)", value: control.onChange });
    fields.push({ key: "getText", label: "getText — 리본이 그려질 때 초기 텍스트", value: control.getText ?? "" });
  }
  if (control.type === "dropDown") {
    fields.push({ key: "onAction", label: "onAction — 항목을 선택했을 때 호출", value: control.onAction });
  }
  if (control.type === "splitButton") {
    fields.push({ key: "onAction", label: "주 버튼 매크로", value: control.button.onAction });
  }
  if (!fields.length) return <p className="text-sm text-mute">이 컨트롤은 콜백이 없습니다.</p>;
  return (
    <>
      {fields.map((f) => (
        <label key={f.key} className="mb-3 block text-sm">
          <span className="mb-1 block font-semibold">{f.label}</span>
          <select className="w-full rounded border border-line bg-white px-2 py-1.5" value={f.value} onChange={(e) => {
            if (e.target.value === "__new__") { onNew(); return; }
            if (control.type === "splitButton" && f.key === "onAction") {
              useEditorStore.getState().patchControl(control.uid, { button: { ...control.button, onAction: e.target.value } } as Partial<Control>);
            } else onChange(f.key, e.target.value);
          }}>
            <option value="">— 선택 안 함 —</option>
            {macros.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
            {f.value && !macros.some((m) => m.name === f.value) ? <option value={f.value}>{f.value}</option> : null}
            <option value="__new__">➕ 새 매크로 만들기…</option>
          </select>
        </label>
      ))}
    </>
  );
}

function ItemEditor({ control }: { control: Extract<Control, { type: "comboBox" | "dropDown" }> }) {
  const patch = useEditorStore((s) => s.patchControl);
  const setItems = (items: ListItem[]) => patch(control.uid, { items } as Partial<Control>);
  return (
    <Card
      title="항목"
      extra={
        <button
          type="button"
          className="grid h-7 w-7 place-items-center rounded-full border border-line text-lg leading-none"
          aria-label="항목 추가"
          onClick={() => {
            const issuer = new IdIssuer(allXmlIds(useEditorStore.getState().ribbon));
            setItems([...control.items, createItem(issuer, `항목 ${control.items.length + 1}`)]);
          }}
        >
          +
        </button>
      }
    >
      {control.items.map((it, i) => (
        <div key={it.uid} className="mb-3 border-b border-line/70 pb-3 last:border-b-0 last:pb-0">
          <IdField
            value={it.id}
            onChange={(id) => setItems(control.items.map((x, n) => n === i ? { ...x, id } : x))}
          />
          <div className="flex items-end gap-2">
            <label className="block flex-1 text-sm">
              <span className="mb-1 block font-semibold">레이블</span>
              <input
                className="w-full rounded border border-line bg-white px-2 py-1.5"
                value={it.label}
                onChange={(e) => setItems(control.items.map((x, n) => n === i ? { ...x, label: e.target.value } : x))}
              />
            </label>
            <button type="button" className="mb-1 grid h-8 w-8 place-items-center text-mute" aria-label="항목 삭제" onClick={() => setItems(control.items.filter((_, n) => n !== i))}>×</button>
          </div>
        </div>
      ))}
    </Card>
  );
}

function ChildEditor({ control }: { control: Extract<Control, { type: "menu" | "splitButton" }> }) {
  const patch = useEditorStore((s) => s.patchControl);
  return (
    <div>
      {control.items.map((it) => (
        <button key={it.uid} type="button" className="mb-1 block underline" onClick={() => useEditorStore.getState().select({ kind: "control", uid: it.uid })}>{it.label || "(이름 없음)"}</button>
      ))}
      <button type="button" className="underline" onClick={() => {
        const issuer = new IdIssuer(allXmlIds(useEditorStore.getState().ribbon));
        const b = createButton(issuer, "하위 버튼");
        patch(control.uid, { items: [...control.items, b] } as Partial<Control>);
      }}>하위 버튼 추가</button>
    </div>
  );
}
