import { useState } from "react";
import { generateCustomUi, prettyXml } from "@/xml/generate";
import { panelVba } from "@/vba/generate";
import { findControl, findGroup, findTab } from "@/model/walk";
import { useEditorStore } from "@/store/useEditorStore";

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
  const selection = useEditorStore((s) => s.selection);
  const xml = prettyXml(generateCustomUi(ribbon));
  const vba = panelVba(ribbon, macros, hasExistingVba);
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
        <Pane title="VBA 코드 (모듈에 붙여넣기)" text={vba} collapsed={collapsed} extra={fold} />
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
