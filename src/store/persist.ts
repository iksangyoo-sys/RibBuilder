import type { MacroDef, OriginKind, RibbonDoc, RibbonImage } from "@/model/types";

export const DRAFT_KEY = "excel-ribbon-builder-draft";

export interface DraftPayload {
  fileName: string;
  originKind: OriginKind;
  originBytesB64: string | null;
  includeVba: boolean;
  /** 2부터 includeVba가 사용자의 선택이다. 그 전 초안은 VBA 저장이 막혀 있어 값이 의미 없다. */
  vbaPref?: number;
  hasExistingVba: boolean;
  ribbon: RibbonDoc;
  images: RibbonImage[];
  macros: MacroDef[];
  savedAt: number;
}

function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}

export function saveDraft(payload: Omit<DraftPayload, "savedAt" | "originBytesB64"> & { originBytes: Uint8Array | null }): void {
  try {
    const originBytesB64 = payload.originBytes && payload.originBytes.length < 1_500_000
      ? bytesToB64(payload.originBytes)
      : null;
    const data: DraftPayload = {
      fileName: payload.fileName,
      originKind: payload.originKind,
      originBytesB64,
      includeVba: payload.includeVba,
      vbaPref: 2,
      hasExistingVba: payload.hasExistingVba,
      ribbon: payload.ribbon,
      images: payload.images,
      macros: payload.macros,
      savedAt: Date.now(),
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
  } catch {
    /* quota or private mode */
  }
}

export function loadDraft(): DraftPayload | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DraftPayload;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}
