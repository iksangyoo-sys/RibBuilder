/**
 * 로컬 실행기(ribbon_builder_local.py)로 열렸을 때 쓰는 저장 경로.
 * 브라우저 다운로드에는 '인터넷에서 받음' 표시가 붙어 엑셀이 매크로를 막으므로,
 * 실행기가 있으면 파일을 실행기에 보내 이 PC에서 직접 쓰게 한다.
 */
export interface LocalHelper {
  addins: string;
  downloads: string;
}

let cached: Promise<LocalHelper | null> | null = null;

export function localHelper(): Promise<LocalHelper | null> {
  if (cached) return cached;
  const local = location.protocol === "http:" && (location.hostname === "127.0.0.1" || location.hostname === "localhost");
  cached = local
    ? fetch("/api/ping", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => (d && d.ok ? { addins: String(d.addins), downloads: String(d.downloads) } : null))
        .catch(() => null)
    : Promise.resolve(null);
  return cached;
}

/** 실행기에 파일을 보내 저장한다. 저장된 전체 경로를 돌려준다. */
export async function saveViaHelper(blob: Blob, name: string): Promise<string> {
  const res = await fetch(`/api/save?name=${encodeURIComponent(name)}`, {
    method: "POST",
    headers: { "X-Ribbon-Builder": "1", "Content-Type": "application/octet-stream" },
    body: blob,
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; path?: string; error?: string };
  if (!res.ok || !data.ok || !data.path) throw new Error(data.error || `로컬 저장 실패 (${res.status})`);
  return data.path;
}
