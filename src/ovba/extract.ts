import * as CFB from "cfb";
import { decompressOvba } from "./compress";

function decodeModule(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  let text = "";
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    if (c === 0) continue;
    text += String.fromCharCode(c);
  }
  return text;
}

function tryDecompress(stream: Uint8Array): Uint8Array {
  try {
    return decompressOvba(stream);
  } catch {
    try {
      return decompressOvba(stream.subarray(1));
    } catch {
      return stream;
    }
  }
}

const SUB_RE = /^\s*(?:Public\s+|Private\s+)?(?:Static\s+)?Sub\s+([A-Za-z가-힣_][A-Za-z0-9가-힣_]*)/gim;

export function extractPublicSubs(vbaProject: Uint8Array): string[] {
  const cfb = CFB.parse(vbaProject);
  const names = new Set<string>();
  for (const entry of cfb.FileIndex) {
    if (!entry || entry.type !== 2 || !entry.content) continue;
    const path = entry.name;
    if (/dir$|_VBA_PROJECT$|PROJECT/i.test(path)) continue;
    const content = entry.content instanceof Uint8Array ? entry.content : Uint8Array.from(entry.content as number[]);
    const raw = tryDecompress(content);
    const text = decodeModule(raw);
    if (!/Attribute\s+VB_Name/i.test(text) && !/\bSub\s+/i.test(text)) continue;
    SUB_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = SUB_RE.exec(text))) {
      if (m[1].toLowerCase() === "class_initialize" || m[1].toLowerCase() === "class_terminate") continue;
      names.add(m[1]);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}
