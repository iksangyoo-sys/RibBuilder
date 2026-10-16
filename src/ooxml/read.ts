import JSZip from "jszip";
import { parseCustomUi, type ParseResult } from "@/xml/parse";
import { parseRelationships, relsPathFor, resolvePath, UI_REL_2006, UI_REL_2007 } from "./rels";
import { classifyOpenError, RibbonFileError } from "./errors";
import type { OriginKind, RibbonImage } from "@/model/types";
import { analyzeVba, extractModules, hiddenSubs, type VbaModule, type VbaProblem } from "@/ovba/extract";

export interface OpenedWorkbook {
  bytes: Uint8Array;
  fileName: string;
  kind: OriginKind;
  ribbon: ParseResult;
  images: RibbonImage[];
  fileMacros: string[];
  /** Sub 이름 → 매개변수 (괄호 안). */
  fileMacroParams: Record<string, string>;
  hasVba: boolean;
  encrypted: boolean;
  /** 파일 VBA에서 찾은, 엑셀에서 매크로가 모두 멈추게 하는 문제 (모호한 이름, 자기 자신 호출 …). */
  vbaProblems: VbaProblem[];
  /** 표준 모듈에 이미 있는 Public Sub·Function 이름 (소문자). 같은 이름을 새로 만들면 "모호한 이름" 오류. */
  vbaTaken: string[];
  /** 리본이 부를 수 없는 곳(문서 모듈, Private)에만 있는 Sub 이름 → 이유. */
  vbaHidden: Record<string, string>;
}

function sniffKind(name: string, zip: JSZip): OriginKind {
  const lower = name.toLowerCase();
  if (lower.endsWith(".xlsb")) return "xlsb";
  if (lower.endsWith(".xlam")) return "xlam";
  if (lower.endsWith(".xlsm")) return "xlsm";
  if ([...Object.keys(zip.files)].some((p) => /vbaProject\.bin$/i.test(p))) return "xlsm";
  return "xlsx";
}

function isEncrypted(zip: JSZip): boolean {
  return Boolean(zip.file("EncryptionInfo") || zip.file("EncryptedPackage"));
}

async function findCustomUiPath(zip: JSZip): Promise<string> {
  const relsFile = zip.file("_rels/.rels");
  if (relsFile) {
    const rels = parseRelationships(await relsFile.async("string"));
    for (const rel of rels) {
      if (rel.type === UI_REL_2007 || rel.type === UI_REL_2006 || /customUI/i.test(rel.target)) {
        const path = rel.target.replace(/^\/+/, "");
        if (zip.file(path)) return path;
      }
    }
  }
  for (const c of ["customUI/customUI14.xml", "customUI/customUI.xml"]) {
    if (zip.file(c)) return c;
  }
  return "";
}

function sniffExt(name: string, bytes: Uint8Array): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "jpeg";
  if (lower.endsWith(".gif")) return "gif";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpeg";
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return "gif";
  return "png";
}

function mimeOf(ext: string): string {
  if (ext === "jpeg" || ext === "jpg") return "image/jpeg";
  if (ext === "gif") return "image/gif";
  return "image/png";
}

async function loadImages(zip: JSZip, uiPath: string): Promise<RibbonImage[]> {
  const relFile = zip.file(relsPathFor(uiPath));
  if (!relFile) return [];
  const rels = parseRelationships(await relFile.async("string"));
  const images: RibbonImage[] = [];
  for (const rel of rels) {
    if (!/\/image/i.test(rel.type)) continue;
    const path = resolvePath(uiPath, rel.target);
    const file = zip.file(path);
    if (!file || !rel.id) continue;
    const bytes = await file.async("uint8array");
    const ext = sniffExt(path, bytes);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    images.push({
      id: rel.id,
      name: path.split("/").pop() ?? rel.id,
      ext,
      dataUrl: `data:${mimeOf(ext)};base64,${btoa(bin)}`,
    });
  }
  return images;
}

export async function openWorkbook(buf: ArrayBuffer | Uint8Array, fileName: string): Promise<OpenedWorkbook> {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".xls") && !lower.endsWith(".xlsx") && !lower.endsWith(".xlsm") && !lower.endsWith(".xlsb") && !lower.endsWith(".xlam")) {
    throw new RibbonFileError("구형 바이너리 형식(.xls)은 열 수 없습니다. .xlsx, .xlsm, .xlsb, .xlam 파일을 선택해 주세요.");
  }
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf) {
    throw new RibbonFileError("구형 바이너리 형식이거나 암호화된 파일은 열 수 없습니다.");
  }
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch (err) {
    throw classifyOpenError(fileName, err);
  }
  if (isEncrypted(zip)) {
    throw new RibbonFileError("암호화된 파일은 열 수 없습니다. 암호를 해제한 뒤 다시 시도해 주세요.");
  }
  const uiPath = await findCustomUiPath(zip);
  const ribbon = uiPath
    ? parseCustomUi(await zip.file(uiPath)!.async("string"))
    : { doc: { tabs: [] }, notes: [] };
  const images = uiPath ? await loadImages(zip, uiPath) : [];
  const vbaFile = Object.keys(zip.files).find((p) => /vbaProject\.bin$/i.test(p));
  let fileMacros: string[] = [];
  let fileMacroParams: Record<string, string> = {};
  let vba: Pick<OpenedWorkbook, "vbaProblems" | "vbaTaken" | "vbaHidden"> = { vbaProblems: [], vbaTaken: [], vbaHidden: {} };
  if (vbaFile) {
    const bin = await zip.file(vbaFile)!.async("uint8array");
    try {
      const a = analyzeVba(bin);
      fileMacros = a.callable;
      fileMacroParams = a.params;
      vba = { vbaProblems: a.problems, vbaTaken: a.taken, vbaHidden: hiddenSubs(bin) };
    } catch {
      fileMacros = [];
      fileMacroParams = {};
    }
  }
  return {
    bytes,
    fileName,
    kind: sniffKind(fileName, zip),
    ribbon,
    images,
    fileMacros,
    fileMacroParams,
    hasVba: Boolean(vbaFile),
    encrypted: false,
    ...vba,
  };
}

/** 불러온 파일에 들어 있는 VBA 모듈 코드 (화면에 읽기 전용으로 보여 주는 용도). 없거나 읽지 못하면 빈 배열. */
export async function readVbaModules(bytes: Uint8Array): Promise<VbaModule[]> {
  try {
    const zip = await JSZip.loadAsync(bytes);
    const vbaFile = Object.keys(zip.files).find((p) => /vbaProject\.bin$/i.test(p));
    if (!vbaFile) return [];
    return extractModules(await zip.file(vbaFile)!.async("uint8array"));
  } catch {
    return [];
  }
}
