import { useMemo, useState } from "react";
import { IMAGE_MSO } from "@/constants/imageMso";
import { PRESET_ICONS, urlToDataUrl } from "@/constants/presetIcons";
import { PREFIX } from "@/model/ids";
import { findControl } from "@/model/walk";
import type { Control } from "@/model/types";
import { vbaNameError } from "@/vba/names";
import { KIND_NAME, SIG, fieldKind, signatureClash } from "@/vba/generate";
import { useEditorStore } from "@/store/useEditorStore";

export function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <Backdrop onClose={onClose}>
      <h3 className="mb-2 text-lg font-bold">사용법</h3>
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li>상단 [파일]에서 새 문서, 엑셀 열기, 예제로 시작할 수 있습니다.</li>
        <li>[+ 탭 추가]로 사용자 탭을 만들고, [+]로 그룹을 만듭니다.</li>
        <li>왼쪽 요소를 클릭하거나 끌어다 놓습니다. 내장 그룹은 드롭다운에서 고릅니다.</li>
        <li>탭·그룹·컨트롤을 오른쪽 클릭해 이름 변경, 복제, 복사/붙여넣기, 삭제합니다.</li>
        <li>하단 [XML 내보내기]에서 코드를 복사하거나 파일을 저장한 뒤, 엑셀 모듈에 VBA를 붙여 넣습니다.</li>
        <li>파일은 이 브라우저 안에서만 읽고 씁니다. Ctrl+Z / Ctrl+S를 쓸 수 있습니다.</li>
      </ol>
      <button type="button" className="mt-4 rounded bg-pine px-3 py-1 text-white" onClick={onClose}>닫기</button>
    </Backdrop>
  );
}

export function IconModal({ controlUid, onClose }: { controlUid: string; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"preset" | "mine" | "mso">("preset");
  const [busy, setBusy] = useState(false);
  const images = useEditorStore((s) => s.images);
  const patch = useEditorStore((s) => s.patchControl);
  const addImage = useEditorStore((s) => s.addImage);
  const selectedId = useEditorStore((s) => findControl(s.ribbon, controlUid)?.control.imageId ?? "");
  const names = useMemo(() => {
    const query = q.trim().toLowerCase();
    const list = query ? IMAGE_MSO.filter((n) => n.toLowerCase().includes(query)) : IMAGE_MSO.slice(0, 80);
    return list.slice(0, 120);
  }, [q]);
  const presets = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return PRESET_ICONS;
    return PRESET_ICONS.filter((icon) => icon.name.toLowerCase().includes(query) || icon.file.toLowerCase().includes(query));
  }, [q]);

  const pickPreset = async (icon: (typeof PRESET_ICONS)[number]) => {
    if (busy) return;
    setBusy(true);
    try {
      const existing = useEditorStore.getState().images.find((img) => img.id === icon.id);
      if (existing) {
        patch(controlUid, { imageId: existing.id, imageMso: "" });
      } else {
        const dataUrl = await urlToDataUrl(icon.url);
        addImage({ id: icon.id, name: icon.name, ext: "png", dataUrl }, controlUid);
      }
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Backdrop onClose={onClose} wide>
      <h3 className="mb-2 text-lg font-bold">아이콘 선택</h3>
      <div className="mb-2 flex gap-3 text-sm">
        <button type="button" className={tab === "preset" ? "font-bold" : "text-mute"} onClick={() => setTab("preset")}>아이콘</button>
        <button type="button" className={tab === "mine" ? "font-bold" : "text-mute"} onClick={() => setTab("mine")}>내 이미지</button>
        <button type="button" className={tab === "mso" ? "font-bold" : "text-mute"} onClick={() => setTab("mso")}>엑셀 기본</button>
      </div>
      {tab !== "mine" ? (
        <input
          className="mb-3 w-full rounded border border-line px-2 py-1"
          placeholder={tab === "preset" ? "아이콘 이름 검색" : "imageMso 검색"}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      ) : null}
      {tab === "preset" ? (
        <div className="grid max-h-[52vh] grid-cols-4 gap-2 overflow-auto sm:grid-cols-6">
          {presets.map((icon) => (
            <button
              key={icon.id}
              type="button"
              disabled={busy}
              title={icon.name}
              className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2 hover:bg-mist ${selectedId === icon.id ? "border-leaf bg-mist ring-1 ring-leaf" : "border-line"}`}
              onClick={() => void pickPreset(icon)}
            >
              <img src={icon.url} alt="" className="h-10 w-10 object-contain" />
              <span className="w-full truncate text-center text-[11px]">{icon.name}</span>
            </button>
          ))}
        </div>
      ) : tab === "mso" ? (
        <div className="max-h-64 overflow-auto">
          {names.map((n) => (
            <button key={n} type="button" className="mr-1 mb-1 rounded border border-line px-2 py-0.5 text-xs" onClick={() => { patch(controlUid, { imageMso: n, imageId: "" }); onClose(); }}>{n}</button>
          ))}
        </div>
      ) : (
        <>
          <label className="inline-block rounded border border-line px-3 py-1">
            PNG 올리기
            <input type="file" accept="image/png,.png" className="hidden" onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                const id = `${PREFIX.image}_${Date.now()}`;
                addImage({ id, name: file.name, ext: "png", dataUrl: String(reader.result) }, controlUid);
                onClose();
              };
              reader.readAsDataURL(file);
            }} />
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            {images.filter((img) => !PRESET_ICONS.some((p) => p.id === img.id)).map((img) => (
              <div key={img.id} className={`relative rounded border p-1 ${selectedId === img.id ? "border-leaf" : "border-line"}`}>
                <button type="button" onClick={() => { patch(controlUid, { imageId: img.id, imageMso: "" }); onClose(); }}>
                  <img src={img.dataUrl} alt={img.name} className="h-10 w-10 object-contain" />
                </button>
                <button
                  type="button"
                  className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-clay text-xs text-white"
                  aria-label={`${img.name} 제거`}
                  onClick={(e) => {
                    e.stopPropagation();
                    useEditorStore.getState().removeImage(img.id);
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </>
      )}
      <button type="button" className="mt-4 rounded border border-line px-3 py-1" onClick={onClose}>닫기</button>
    </Backdrop>
  );
}

export function MacroManager({ onClose, onCreate }: { onClose: () => void; onCreate: () => void }) {
  const macros = useEditorStore((s) => s.macros);
  const remove = useEditorStore((s) => s.removeMacro);
  const [tab, setTab] = useState<"file" | "builder" | "manual">("builder");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const addMacro = useEditorStore((s) => s.addMacro);
  const list = macros.filter((m) => m.source === tab);
  return (
    <Backdrop onClose={onClose}>
      <h3 className="mb-2 text-lg font-bold">매크로 관리</h3>
      <div className="mb-3 flex gap-3">
        <button type="button" className={tab === "file" ? "font-bold" : ""} onClick={() => setTab("file")}>기존 파일</button>
        <button type="button" className={tab === "builder" ? "font-bold" : ""} onClick={() => setTab("builder")}>빌더 추가</button>
        <button type="button" className={tab === "manual" ? "font-bold" : ""} onClick={() => setTab("manual")}>직접 입력</button>
      </div>
      <ul className="mb-3 max-h-48 overflow-auto">
        {list.length ? list.map((m) => (
          <li key={m.name} className="flex justify-between border-b border-line py-1">
            <span>{m.name}</span>
            {m.source !== "file" ? <button type="button" className="text-clay" onClick={() => remove(m.name)}>삭제</button> : null}
          </li>
        )) : <li className="text-mute">목록이 없습니다.</li>}
      </ul>
      {tab === "manual" ? (
        <form className="flex gap-2" onSubmit={(e) => {
          e.preventDefault();
          const msg = vbaNameError(name.trim());
          if (msg) { setErr(msg); return; }
          addMacro({ name: name.trim(), source: "manual" });
          setName(""); setErr("");
        }}>
          <input className="w-full rounded border border-line px-2 py-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="다른 파일의 매크로 이름" />
          <button type="submit" className="rounded bg-pine px-3 py-1 text-white">등록</button>
        </form>
      ) : tab === "builder" ? (
        <button type="button" className="rounded bg-pine px-3 py-1 text-white" onClick={onCreate}>새 매크로 만들기</button>
      ) : (
        <p className="text-sm text-mute">불러온 파일의 vbaProject.bin에서 읽은 Public Sub입니다.</p>
      )}
      {err ? <p className="text-clay">{err}</p> : null}
      <button type="button" className="mt-4 rounded border border-line px-3 py-1" onClick={onClose}>닫기</button>
    </Backdrop>
  );
}

/** target: 이 창을 연 콜백 칸(onAction, getPressed …). 만든 매크로를 그 칸에 바로 연결한다. */
export function NewMacroModal({ onClose, target }: { onClose: () => void; target?: string }) {
  const selection = useEditorStore((s) => s.selection);
  const ribbon = useEditorStore((s) => s.ribbon);
  const macros = useEditorStore((s) => s.macros);
  const found = selection.kind === "control" ? ribbon.tabs.flatMap((t) => t.groups).flatMap((g) => g.kind === "custom" ? g.controls : []).find((c) => c.uid === selection.uid) : undefined;
  const key = target ?? "onAction";
  const kind = fieldKind(found?.type ?? "button", key);
  const [name, setName] = useState(() => suggestMacroName(found?.type, key, macros.map((m) => m.name)));
  const [err, setErr] = useState("");
  const addMacro = useEditorStore((s) => s.addMacro);
  const sig = SIG[kind];
  return (
    <Backdrop onClose={onClose}>
      <h3 className="mb-2 text-lg font-bold">새 매크로 만들기</h3>
      <label className="block text-sm">
        Sub 이름
        <input className="mt-1 w-full rounded border border-line px-2 py-1" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <pre className="mt-3 rounded bg-paper p-2 text-xs">Sub {name || "이름"}({sig})</pre>
      {err ? <p className="text-clay">{err}</p> : null}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="rounded border border-line px-3 py-1" onClick={onClose}>취소</button>
        <button type="button" className="rounded bg-pine px-3 py-1 text-white" onClick={() => {
          const msg = vbaNameError(name.trim());
          if (msg) { setErr(msg); return; }
          const ownerUid = found?.type === "splitButton" ? found.button.uid : found?.uid ?? "";
          const clash = signatureClash(ribbon, name.trim(), kind, ownerUid, key);
          if (clash) {
            setErr(`"${name.trim()}"는 ${clash.label || clash.controlId}의 ${KIND_NAME[clash.kind]}에 이미 쓰고 있어 형식이 맞지 않습니다. 다른 이름을 쓰세요.`);
            return;
          }
          addMacro({ name: name.trim(), source: "builder" });
          if (found && target) {
            const patch = useEditorStore.getState().patchControl;
            if (found.type === "splitButton" && target === "onAction") {
              patch(found.uid, { button: { ...found.button, onAction: name.trim() } } as Partial<Control>);
            } else {
              patch(found.uid, { [target]: name.trim() } as Partial<Control>);
            }
          }
          onClose();
        }}>추가</button>
      </div>
    </Backdrop>
  );
}

/** 컨트롤 종류에 맞는 접두어로, 아직 없는 매크로 이름을 제안한다 (예: 드롭다운 → dd_실행). */
function suggestMacroName(type: string | undefined, key: string, taken: string[]): string {
  const prefix = !type || type === "splitButton" ? "btn" : PREFIX[type] ?? "btn";
  const base = `${prefix}_${key.startsWith("get") ? "초기값" : "실행"}`;
  let name = base;
  for (let n = 2; taken.includes(name); n++) name = `${base}${n}`;
  return name;
}

export function ConfirmModal({ message, onYes, onNo }: { message: string; onYes: () => void; onNo: () => void }) {
  return (
    <Backdrop onClose={onNo}>
      <p className="mb-4">{message}</p>
      <div className="flex justify-end gap-2">
        <button type="button" className="rounded border border-line px-3 py-1" onClick={onNo}>취소</button>
        <button type="button" className="rounded bg-clay px-3 py-1 text-white" onClick={onYes}>삭제</button>
      </div>
    </Backdrop>
  );
}

export function IssuesModal({ issues, onGoto, onClose, onContinue }: {
  issues: { level: string; uid: string; message: string }[];
  onGoto: (uid: string) => void;
  onClose: () => void;
  onContinue?: () => void;
}) {
  const blocked = issues.some((i) => i.level === "error");
  return (
    <Backdrop onClose={onClose}>
      <h3 className="mb-2 text-lg font-bold">저장 전 확인</h3>
      <div className="max-h-64 overflow-auto">
        {issues.map((it, i) => (
          <button key={i} type="button" className={`mb-1 block w-full rounded border px-2 py-1 text-left ${it.level === "error" ? "border-clay bg-red-50" : "border-sand bg-amber-50"}`} onClick={() => onGoto(it.uid)}>
            {it.level === "error" ? "오류" : "확인"} · {it.message}
          </button>
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="rounded border border-line px-3 py-1" onClick={onClose}>돌아가서 수정</button>
        {onContinue ? <button type="button" className="rounded bg-pine px-3 py-1 text-white disabled:opacity-40" disabled={blocked} onClick={onContinue}>그래도 저장</button> : null}
      </div>
    </Backdrop>
  );
}

function Backdrop({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`max-h-[80vh] w-full overflow-auto rounded-2xl bg-card p-4 shadow-xl ${wide ? "max-w-3xl" : "max-w-lg"}`}>{children}</div>
    </div>
  );
}
