import { useEffect, useRef, useState } from "react";
import { EXAMPLES } from "@/examples";

type Props = {
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onExample: (id: string) => void;
};

export function Header({ onNew, onOpen, onSave, onExample }: Props) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 bg-pine px-4 py-2.5 text-white">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/15 text-sm font-bold" aria-hidden>RB</span>
        <div>
          <div className="text-base font-bold leading-tight">yes&apos;s Excel Ribbon Builder</div>
          <div className="text-xs text-white/70">드래그&드롭</div>
        </div>
      </div>
      <div className="relative" ref={box}>
        <button
          type="button"
          aria-label="파일"
          onClick={() => setOpen((v) => !v)}
          className="rounded-md border border-white/35 px-3 py-1.5 text-sm hover:bg-white/10"
        >
          파일
        </button>
        {open ? (
          <div role="menu" className="absolute right-0 z-40 mt-1 min-w-48 rounded-lg border border-line bg-card py-1 text-ink shadow-lg">
            <MenuItem label="새 문서" onClick={() => { setOpen(false); onNew(); }} />
            <MenuItem label="엑셀 열기" onClick={() => { setOpen(false); onOpen(); }} />
            <div className="px-3 pt-2 pb-1 text-xs font-semibold text-mute">예제로 시작</div>
            {EXAMPLES.map((ex) => (
              <MenuItem
                key={ex.id}
                label={ex.name}
                hint={ex.desc}
                onClick={() => { setOpen(false); onExample(ex.id); }}
              />
            ))}
            <hr className="my-1 border-line" />
            <MenuItem label="저장하기" onClick={() => { setOpen(false); onSave(); }} />
          </div>
        ) : null}
      </div>
    </header>
  );
}

function MenuItem({ label, hint, onClick }: { label: string; hint?: string; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" className="block w-full px-3 py-1.5 text-left hover:bg-mist" onClick={onClick}>
      <span className="block text-sm">{label}</span>
      {hint ? <span className="block text-xs text-mute">{hint}</span> : null}
    </button>
  );
}
