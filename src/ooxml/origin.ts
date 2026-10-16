/**
 * 지금 편집 중인 엑셀 파일을 디스크에서 다시 읽는 방법.
 *
 * 빌더가 파일을 연 뒤 학생이 그 파일(또는 빌더가 저장한 파일)을 엑셀에서 열어 VBA를 쓰고 저장하는 일이 많다.
 * 처음 읽은 바이트로 다시 저장하면 그 VBA가 사라지므로, 저장할 때마다 디스크의 최신 내용을 다시 읽는다.
 */

export type OriginSource =
  /** 파일 선택 창(File System Access)으로 연 파일. 언제든 최신 내용을 읽을 수 있다. */
  | { kind: "handle"; handle: FileSystemFileHandleLike }
  /** <input type=file>로 연 파일. 디스크에서 바뀌면 크롬은 읽기를 거부하므로(NotReadableError) 다시 고르게 한다. */
  | { kind: "file"; file: File }
  /** 로컬 실행기가 저장한 파일 (경로로 다시 읽는다). */
  | { kind: "helper"; path: string };

/** TypeScript DOM 타입에 아직 없는 브라우저도 있어 필요한 부분만 적는다. */
export interface FileSystemFileHandleLike {
  name: string;
  getFile(): Promise<File>;
}

let source: OriginSource | null = null;

export function setOriginSource(next: OriginSource | null): void {
  source = next;
}

export function hasOriginSource(): boolean {
  return source !== null;
}

export type ReadResult =
  | { ok: true; bytes: Uint8Array; name: string }
  /** 다시 읽을 수 없다: 학생에게 파일을 다시 고르게 한다. */
  | { ok: false };

export async function readOriginSource(): Promise<ReadResult> {
  if (!source) return { ok: false };
  try {
    if (source.kind === "handle") {
      const file = await source.handle.getFile();
      return { ok: true, bytes: new Uint8Array(await file.arrayBuffer()), name: file.name };
    }
    if (source.kind === "file") {
      return { ok: true, bytes: new Uint8Array(await source.file.arrayBuffer()), name: source.file.name };
    }
    const res = await fetch(`/api/read?path=${encodeURIComponent(source.path)}`, {
      cache: "no-store",
      headers: { "X-Ribbon-Builder": "1" },
    });
    if (!res.ok) return { ok: false };
    return { ok: true, bytes: new Uint8Array(await res.arrayBuffer()), name: source.path.split(/[\\/]/).pop() ?? "" };
  } catch {
    return { ok: false };
  }
}

export function sameBytes(a: Uint8Array | null, b: Uint8Array): boolean {
  if (!a || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

type PickerWindow = Window & {
  showOpenFilePicker?: (options: unknown) => Promise<FileSystemFileHandleLike[]>;
};

const PICKER_TYPES = [
  {
    description: "엑셀 파일",
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel.sheet.macroEnabled.12": [".xlsm"],
      "application/vnd.ms-excel.sheet.binary.macroEnabled.12": [".xlsb"],
      "application/vnd.ms-excel.addin.macroEnabled.12": [".xlam"],
    },
  },
];

/**
 * 파일 선택 창을 연다. 크롬·엣지에서는 나중에 다시 읽을 수 있는 핸들로 열고,
 * 그 밖의 브라우저에서는 null을 돌려준다 (호출한 쪽이 <input type=file>을 쓴다).
 * 사용자가 취소하면 "cancel".
 */
export async function pickWithHandle(): Promise<{ file: File; handle: FileSystemFileHandleLike } | "cancel" | null> {
  const w = window as PickerWindow;
  if (typeof w.showOpenFilePicker !== "function") return null;
  try {
    const [handle] = await w.showOpenFilePicker({ types: PICKER_TYPES, excludeAcceptAllOption: false, multiple: false });
    if (!handle) return "cancel";
    return { file: await handle.getFile(), handle };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return "cancel";
    // 보안 정책 등으로 쓸 수 없으면 일반 파일 선택으로 넘어간다.
    return null;
  }
}
