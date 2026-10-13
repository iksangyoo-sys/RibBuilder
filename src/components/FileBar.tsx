import { useEditorStore } from "@/store/useEditorStore";

type Props = {
  onOpenFile: () => void;
  onSave: () => void;
  onHelp: () => void;
  onMacros: () => void;
};

export function FileBar({ onOpenFile, onSave, onHelp, onMacros }: Props) {
  const fileName = useEditorStore((s) => s.fileName);
  const dirty = useEditorStore((s) => s.dirty);
  const includeVba = useEditorStore((s) => s.includeVba);
  const setIncludeVba = useEditorStore((s) => s.setIncludeVba);
  const hasExistingVba = useEditorStore((s) => s.hasExistingVba);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const canUndo = useEditorStore((s) => s.past.length > 0);
  const canRedo = useEditorStore((s) => s.future.length > 0);

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line bg-card px-4 py-2 text-sm">
      <span className="min-w-0 truncate">
        📄 <b>{fileName}</b>
        {dirty ? <span className="ml-1 text-leaf" title="저장하지 않은 변경">●</span> : null}
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <button type="button" className="rounded border border-line px-2 py-1 disabled:opacity-40" disabled={!canUndo} onClick={undo} aria-label="실행 취소">실행 취소</button>
        <button type="button" className="rounded border border-line px-2 py-1 disabled:opacity-40" disabled={!canRedo} onClick={redo} aria-label="다시 실행">다시 실행</button>
        <button type="button" className="rounded border border-line px-2 py-1" onClick={onHelp}>사용법</button>
        <button type="button" className="rounded border border-line px-2 py-1" onClick={onMacros}>매크로 관리</button>
        <label className="inline-flex items-center gap-1">
          <input type="checkbox" checked={includeVba} onChange={(e) => setIncludeVba(e.target.checked)} />
          VBA 포함
        </label>
        {includeVba && hasExistingVba ? <span className="text-xs text-sand">기존 VBA가 있어 코드 복사 방식만 지원합니다.</span> : null}
        <button type="button" className="rounded border border-line px-2 py-1" onClick={onOpenFile}>다른 파일 불러오기</button>
        <button type="button" className="rounded bg-pine px-3 py-1 font-semibold text-white" onClick={onSave}>저장하기</button>
      </div>
    </div>
  );
}
