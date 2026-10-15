import { useMemo, useState } from "react";
import { validateDoc } from "@/model/validate";
import { generateCustomUi, prettyXml } from "@/xml/generate";
import { panelVba } from "@/vba/generate";
import { parseErrorLocation } from "@/xml/parse";
import { previewXml } from "@/xml/merge";
import { useEditorStore } from "@/store/useEditorStore";

function Backdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="max-h-[86vh] w-full max-w-3xl overflow-auto rounded-2xl bg-card p-4 shadow-xl">{children}</div>
    </div>
  );
}

export function XmlImportModal({ onClose }: { onClose: () => void }) {
  const importXml = useEditorStore((s) => s.importXml);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<"replace" | "merge">("replace");
  const [err, setErr] = useState("");
  const [changes, setChanges] = useState<{ from: string; to: string }[]>([]);
  const preview = useMemo(() => {
    if (!draft.trim()) return null;
    try { return previewXml(draft); } catch (e) {
      return { error: e instanceof Error ? e.message : "해석 실패" };
    }
  }, [draft]);

  const apply = () => {
    const result = importXml(draft, mode);
    if (!result.ok) {
      setErr(parseErrorLocation(draft, result.message));
      return;
    }
    setChanges(result.changes);
    if (!result.changes.length) onClose();
  };

  return (
    <Backdrop onClose={onClose}>
      <h3 className="mb-2 text-lg font-bold">XML 가져오기</h3>
      <p className="mb-2 text-sm text-mute">텍스트를 붙여넣거나 .xml 파일을 고릅니다. 2006·2009 네임스페이스를 모두 읽습니다.</p>
      <label className="mb-2 inline-block rounded border border-line px-3 py-1 text-sm">
        .xml 파일 선택
        <input type="file" accept=".xml,text/xml" className="hidden" onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          void file.text().then(setDraft);
        }} />
      </label>
      <textarea
        className="mb-2 h-40 w-full rounded border border-line p-2 font-mono text-xs"
        value={draft}
        onChange={(e) => { setDraft(e.target.value); setErr(""); }}
        placeholder="<customUI ...>"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file) void file.text().then(setDraft);
        }}
      />
      <div className="mb-2 flex gap-4 text-sm">
        <label><input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} /> 현재 리본 교체</label>
        <label><input type="radio" checked={mode === "merge"} onChange={() => setMode("merge")} /> 현재 리본에 탭 추가(병합)</label>
      </div>
      {preview && "error" in preview ? <p className="text-clay">{preview.error}</p> : null}
      {preview && !("error" in preview) ? (
        <p className="mb-2 text-sm">미리보기: 탭 {preview.tabs} · 그룹 {preview.groups} · 컨트롤 {preview.controls} · 콜백 {preview.callbacks.length}개</p>
      ) : null}
      {err ? <p className="text-clay">{err}</p> : null}
      {changes.length ? (
        <div className="mb-2 text-sm">
          id 충돌을 자동으로 바꿨습니다.
          <ul className="max-h-24 overflow-auto text-xs">{changes.map((c) => <li key={c.from}>{c.from} → {c.to}</li>)}</ul>
          <button type="button" className="mt-2 rounded bg-pine px-3 py-1 text-white" onClick={onClose}>확인</button>
        </div>
      ) : (
        <div className="flex justify-end gap-2">
          <button type="button" className="rounded border border-line px-3 py-1" onClick={onClose}>취소</button>
          <button type="button" className="rounded bg-pine px-3 py-1 text-white" onClick={apply}>가져오기</button>
        </div>
      )}
    </Backdrop>
  );
}

export function XmlExportModal({ onClose, onGoto }: { onClose: () => void; onGoto: (uid: string) => void }) {
  const ribbon = useEditorStore((s) => s.ribbon);
  const macros = useEditorStore((s) => s.macros);
  const images = useEditorStore((s) => s.images);
  const hasExistingVba = useEditorStore((s) => s.hasExistingVba);
  const [tab, setTab] = useState<"xml" | "vba">("xml");
  const [ns, setNs] = useState<"2009" | "2006">("2009");
  const [pretty, setPretty] = useState(true);
  const [comments, setComments] = useState(false);
  const xml = generateCustomUi(ribbon, { ns, pretty, comments });
  const vba = panelVba(ribbon, macros, hasExistingVba);
  const issues = validateDoc(ribbon, new Set(images.map((i) => i.id)), macros);
  const text = tab === "xml" ? xml : vba;

  const download = () => {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = tab === "xml" ? "customUI14.xml" : "RibbonCallbacks.bas";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Backdrop onClose={onClose}>
      <h3 className="mb-2 text-lg font-bold">XML 내보내기</h3>
      <div className="mb-2 flex gap-3">
        <button type="button" className={tab === "xml" ? "font-bold" : ""} onClick={() => setTab("xml")}>리본 XML</button>
        <button type="button" className={tab === "vba" ? "font-bold" : ""} onClick={() => setTab("vba")}>VBA 코드</button>
      </div>
      {issues.length ? (
        <ul className="mb-2 max-h-20 overflow-auto text-sm">
          {issues.map((it, i) => (
            <li key={i}>
              <button type="button" className={it.level === "error" ? "text-clay" : "text-sand"} onClick={() => onGoto(it.uid)}>
                {it.level === "error" ? "오류" : "경고"} · {it.message}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {tab === "xml" ? (
        <div className="mb-2 flex flex-wrap gap-3 text-sm">
          <label>네임스페이스
            <select className="ml-1 rounded border border-line" value={ns} onChange={(e) => setNs(e.target.value as "2009" | "2006")}>
              <option value="2009">2009 (기본)</option>
              <option value="2006">2006 호환</option>
            </select>
          </label>
          <label><input type="checkbox" checked={pretty} onChange={(e) => setPretty(e.target.checked)} /> 들여쓰기</label>
          <label><input type="checkbox" checked={comments} onChange={(e) => setComments(e.target.checked)} /> 주석 포함</label>
        </div>
      ) : (
        <p className="mb-2 text-xs text-sand">기존 VBA와 이름이 충돌하지 않는지 확인하세요.</p>
      )}
      <CodeView text={tab === "xml" ? prettyXml(xml) : vba} />
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className="rounded border border-line px-3 py-1" onClick={() => void navigator.clipboard.writeText(text)}>복사</button>
        <button type="button" className="rounded border border-line px-3 py-1" onClick={download}>파일로 다운로드</button>
        <button type="button" className="rounded bg-pine px-3 py-1 text-white" onClick={onClose}>닫기</button>
      </div>
    </Backdrop>
  );
}

export function CodeView({ text, highlight }: { text: string; highlight?: string }) {
  const lines = text.split(/\r?\n/);
  return (
    <pre className="max-h-72 overflow-auto rounded bg-paper p-2 font-mono text-xs leading-5">
      {lines.map((line, i) => (
        <div key={i} className={highlight && line.includes(`id="${highlight}"`) ? "bg-mist" : ""}>
          <span className="mr-3 inline-block w-8 text-right text-mute">{i + 1}</span>
          {line}
        </div>
      ))}
    </pre>
  );
}

const ADDIN_DIR = "%APPDATA%\\Microsoft\\AddIns";

function CopyText({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="rounded border border-line px-1.5 py-0.5 text-xs text-mute hover:bg-mist"
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setDone(true);
        window.setTimeout(() => setDone(false), 1200);
      }}
    >
      {done ? "복사됨" : label}
    </button>
  );
}

export function SavedModal({
  fileName, includeVba, hasCallback, appendedModule, onClose,
}: {
  fileName: string;
  includeVba: boolean;
  hasCallback: boolean;
  appendedModule?: string;
  onClose: () => void;
}) {
  return (
    <Backdrop onClose={onClose}>
      <h3 className="mb-2 text-lg font-bold">저장했습니다</h3>
      <p className="mb-2 text-sm">파일 이름: <b>{fileName}</b></p>
      {appendedModule ? (
        <p className="mb-2 text-sm">기존 VBA 코드는 그대로 두고, 새 매크로를 <b>{appendedModule}</b> 모듈에 넣었습니다.</p>
      ) : null}
      {includeVba && /\.xlam$/i.test(fileName) ? (
        <>
          {/* 추가 기능은 노란 막대가 없어, 차단되거나 이름이 겹치면 조용히 실행되지 않는다. */}
          <div className="mb-3 rounded border border-sand bg-amber-50 p-3 text-sm">
            <p className="mb-1 font-semibold">추가 기능(.xlam)이 동작하지 않는 흔한 원인 두 가지</p>
            <ul className="list-disc space-y-0.5 pl-5">
              <li><b>차단 해제를 하지 않음</b> — 인터넷에서 받은 파일이라 엑셀이 매크로를 조용히 막습니다.</li>
              <li><b>같은 이름의 .xlam이 두 곳에 있음</b> — 다운로드 폴더·바탕화면에 남은 파일과 추가 기능 폴더의 파일이 겹치면 엑셀이 열지 못합니다.</li>
            </ul>
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>내려받은 파일에서 마우스 오른쪽 → <b>속성</b> → 아래쪽 <b>차단 해제</b>에 체크 → 확인. <span className="text-clay">(꼭 먼저)</span></li>
            <li>
              파일을 추가 기능 폴더로 <b>옮깁니다(복사 말고 잘라내기)</b>. 탐색기 주소창에 <b>{ADDIN_DIR}</b>{" "}
              <CopyText text={ADDIN_DIR} label="주소 복사" />
              <br /><span className="text-mute">다운로드 폴더나 바탕화면에 같은 파일을 남기지 마세요.</span>
            </li>
            <li>엑셀 → <b>개발 도구 → Excel 추가 기능</b>에서 <b>예전 버전의 체크를 먼저 해제</b>하고, 이 파일(<b>{fileName}</b>)을 체크합니다. 예전 파일은 추가 기능 폴더에서 지웁니다.</li>
            <li>.xlam 파일을 <b>더블클릭해서 열지 마세요</b>. 추가 기능은 위 창에서 켜고 끕니다.</li>
            <li>리본 단추를 눌러 “… 호출됨” 메시지가 뜨는지 확인합니다.</li>
            <li>Alt+F11 → <b>{appendedModule ?? "RibbonCallbacks"}</b> 모듈의 TODO 자리에 실제 코드를 채우고, VBA 편집기에서 Ctrl+S로 저장합니다.</li>
          </ol>
        </>
      ) : includeVba ? (
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {/* 인터넷에서 받은 파일은 Windows가 매크로를 막는다 ("보안 위험" 막대). */}
          <li>내려받은 파일에서 마우스 오른쪽 → <b>속성</b> → 아래쪽 <b>차단 해제</b>에 체크 → 확인.</li>
          <li>엑셀에서 열고, 노란 막대가 나오면 <b>콘텐츠 사용</b>을 누릅니다.</li>
          <li>리본 단추를 눌러 “… 호출됨” 메시지가 뜨는지 확인합니다.</li>
          <li>Alt+F11 → <b>{appendedModule ?? "RibbonCallbacks"}</b> 모듈의 TODO 자리에 실제 코드를 채웁니다.</li>
        </ol>
      ) : (
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>내려받은 파일을 엑셀에서 엽니다.</li>
          {hasCallback ? (
            <>
              <li>Alt+F11 → 삽입 → 모듈 → 아래쪽 VBA 패널의 코드를 붙여 넣습니다.</li>
              <li>매크로가 들어가야 하므로 <b>.xlsm</b>(매크로 사용 통합 문서)으로 저장합니다.</li>
            </>
          ) : null}
        </ol>
      )}
      <button type="button" className="mt-4 rounded bg-pine px-3 py-1 text-white" onClick={onClose}>확인</button>
    </Backdrop>
  );
}
