import { useEffect, useState } from "react";
import { generateCustomUi, prettyXml } from "@/xml/generate";
import { panelVba } from "@/vba/generate";
import { findControl, findGroup, findTab } from "@/model/walk";
import { useEditorStore } from "@/store/useEditorStore";
import { readVbaModules } from "@/ooxml/read";

type Props = {
  collapsed: boolean;
  onToggle: () => void;
  onImport: () => void;
  onExport: () => void;
};

export function BottomPanel({ collapsed, onToggle, onImport, onExport }: Props) {
  const ribbon = useEditorStore((s) => s.ribbon);
  const macros = useEditorStore((s) => s.macros);
  const hasExistingVba = useEditorStore((s) => s.hasExistingVba);
  const originBytes = useEditorStore((s) => s.originBytes);
  const selection = useEditorStore((s) => s.selection);
  const xml = prettyXml(generateCustomUi(ribbon));
  const newVba = panelVba(ribbon, macros, hasExistingVba);
  const existingVba = useExistingVba(hasExistingVba ? originBytes : null);
  const [vbaView, setVbaView] = useState<"new" | "file">("new");
  const showFile = vbaView === "file" && existingVba !== null;
  const vba = showFile ? existingVba : newVba;
  const highlightId = selectedXmlId(ribbon, selection);
  const fold = (
    <button
      type="button"
      className="rounded px-1.5 py-0.5 text-xs text-mute hover:bg-mist"
      onClick={onToggle}
      aria-label={collapsed ? "하단 패널 펼치기" : "하단 패널 접기"}
    >
      {collapsed ? "펼치기" : "접기"}
    </button>
  );

  return (
    <section className="border-t border-line bg-card">
      <div className="grid grid-cols-2 divide-x divide-line">
        <Pane
          title="XML 미리보기"
          text={xml}
          highlight={highlightId}
          collapsed={collapsed}
          extra={
            <>
              <button type="button" className="rounded px-1.5 py-0.5 text-xs text-mute hover:bg-mist" onClick={onImport}>XML 가져오기</button>
              <button type="button" className="rounded px-1.5 py-0.5 text-xs text-mute hover:bg-mist" onClick={onExport}>XML 내보내기</button>
              {fold}
            </>
          }
        />
        <Pane
          title={showFile ? "VBA 코드 (파일에 있는 코드 · 읽기 전용)" : "VBA 코드 (모듈에 붙여넣기)"}
          text={vba}
          collapsed={collapsed}
          extra={
            <>
              {existingVba !== null ? (
                <div className="flex overflow-hidden rounded border border-line text-xs" role="group" aria-label="VBA 코드 보기 전환">
                  <button type="button" className={`px-1.5 py-0.5 ${showFile ? "text-mute hover:bg-mist" : "bg-mist font-semibold"}`} aria-pressed={!showFile} onClick={() => setVbaView("new")}>새 코드</button>
                  <button type="button" className={`border-l border-line px-1.5 py-0.5 ${showFile ? "bg-mist font-semibold" : "text-mute hover:bg-mist"}`} aria-pressed={showFile} onClick={() => setVbaView("file")}>파일의 기존 코드</button>
                </div>
              ) : null}
              {fold}
            </>
          }
        />
      </div>
    </section>
  );
}

function Pane({
  title, text, highlight, collapsed, extra,
}: {
  title: string;
  text: string;
  highlight?: string;
  collapsed: boolean;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex items-center gap-2 px-3 py-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <div className="ml-auto flex items-center gap-2">
          {extra}
          <CopyButton text={text} />
        </div>
      </div>
      {collapsed ? null : <CodeBlock text={text} highlight={highlight} />}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="rounded border border-line px-2 py-0.5 text-xs text-mute hover:bg-mist"
      aria-label="복사"
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setDone(true);
        window.setTimeout(() => setDone(false), 1200);
      }}
    >
      {done ? "복사됨" : "복사"}
    </button>
  );
}

function CodeBlock({ text, highlight }: { text: string; highlight?: string }) {
  const lines = text.split(/\r?\n/);
  return (
    <pre className="h-52 overflow-auto bg-[#f3f1ec] px-3 pb-3 font-mono text-xs leading-5">
      {lines.map((line, i) => (
        <div key={i} className={highlight && line.includes(`id="${highlight}"`) ? "bg-mist" : ""}>
          <span className="mr-3 inline-block w-6 text-right text-mute/70">{i + 1}</span>
          {line || " "}
        </div>
      ))}
    </pre>
  );
}

function selectedXmlId(ribbon: ReturnType<typeof useEditorStore.getState>["ribbon"], selection: ReturnType<typeof useEditorStore.getState>["selection"]): string | undefined {
  if (selection.kind === "tab") {
    const t = findTab(ribbon, selection.uid);
    return t?.kind === "custom" ? t.id : undefined;
  }
  if (selection.kind === "group") {
    const g = findGroup(ribbon, selection.uid)?.group;
    return g?.kind === "custom" ? g.id : undefined;
  }
  if (selection.kind === "control") return findControl(ribbon, selection.uid)?.control.id;
  return undefined;
}

/** 불러온 파일의 VBA 모듈을 읽어 한 덩어리 텍스트로 만든다. VBA가 없으면 null. */
function useExistingVba(bytes: Uint8Array | null): string | null {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!bytes) {
      setText(null);
      return;
    }
    void readVbaModules(bytes).then((modules) => {
      if (!alive) return;
      setText(
        modules.length
          ? modules.map((m) => `' ===== ${m.name} =====\r\n${m.code}`).join("\r\n\r\n")
          : "' 이 파일의 VBA 코드를 읽지 못했습니다.\r\n' (암호로 잠긴 프로젝트이거나 형식이 다를 수 있습니다)",
      );
    });
    return () => {
      alive = false;
    };
  }, [bytes]);
  return text;
}
