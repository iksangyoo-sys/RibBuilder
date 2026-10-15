import JSZip from "jszip";
import { generateCustomUi } from "@/xml/generate";
import type { OriginKind, RibbonDoc, RibbonImage } from "@/model/types";
import {
  ensurePngDefault,
  ensureWorkbookCodeName,
  setSheetCodeName,
  sheetCodeName,
  worksheetParts,
  imageRelsXml,
  setMacroEnabledWorkbook,
  upsertCustomUiOverride,
  upsertUiRelationship,
  upsertVbaOverride,
  upsertVbaRelationship,
} from "./rels";
import type { VbaHost } from "@/ovba/embed";
import { BLANK_XLSX_B64 } from "./blank";
import { buildVbaProject } from "@/ovba/embed";
import { appendModule } from "@/ovba/append";

export interface SaveOptions {
  originBytes: Uint8Array | null;
  originKind: OriginKind;
  fileName: string;
  doc: RibbonDoc;
  images: RibbonImage[];
  includeVba: boolean;
  vbaSource: string;
  hasExistingVba: boolean;
  /** 저장 결과 메모: 기존 VBA에 더한 모듈 이름, 또는 더하지 못한 이유. */
  report?: { appendedModule?: string; vbaError?: string };
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = String(dataUrl).split(",")[1] || "";
  return b64ToBytes(b64);
}

export function downloadName(opts: SaveOptions, now: Date = new Date()): string {
  let name = opts.fileName || "새 통합문서.xlsx";
  const m = /^(.*?)(\.(xlsx|xlsm|xlsb|xlam))?$/i.exec(name);
  // 이전에 받은 "이름_ribbon", "이름_ribbon_1", "이름_ribbon (1)", "이름_ribbon_1015_1753" 은 원래 이름으로 되돌린다.
  const base = (m?.[1] || "새 통합문서").replace(/_ribbon(?:_\d{4}_\d{4})?(?:_\d+| ?\(\d+\))?$/i, "");
  let ext = m?.[2] || ".xlsx";
  // 매크로 없는 .xlsx만 .xlsm으로 바꾼다 (.xlsm·.xlam·.xlsb는 이미 매크로를 담을 수 있다).
  if (opts.includeVba && ext.toLowerCase() === ".xlsx") ext = ".xlsm";
  // 새로 만든 통합 문서는 "새 통합문서.xlsm"처럼 그대로, 불러온 파일은 원본과 구분되게 _ribbon을 붙인다.
  if (opts.originKind === "blank") return `${base}${ext}`;
  // 추가 기능은 저장할 때마다 이름이 달라야 한다: 같은 이름의 .xlam이 두 곳에 있으면
  // ("이름이 같은 통합 문서가 열려 있습니다") 엑셀이 새 추가 기능을 열지 못한다.
  if (ext.toLowerCase() === ".xlam") return `${base}_ribbon_${stamp(now)}${ext}`;
  return `${base}_ribbon${ext}`;
}

/** 월일_시분 (예: 1015_1753). */
function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

export function mimeOfSave(opts: SaveOptions): string {
  const name = downloadName(opts).toLowerCase();
  if (name.endsWith(".xlsm")) return "application/vnd.ms-excel.sheet.macroEnabled.12";
  if (name.endsWith(".xlsb")) return "application/vnd.ms-excel.sheet.binary.macroEnabled.12";
  if (name.endsWith(".xlam")) return "application/vnd.ms-excel.addin.macroEnabled.12";
  return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

/** VBA 문서 모듈과 짝이 되도록 통합 문서·워크시트에 codeName을 붙인다. */
async function assignCodeNames(zip: JSZip): Promise<VbaHost> {
  const read = async (path: string) => (await zip.file(path)?.async("string")) ?? null;
  const wbXml = await read("xl/workbook.xml");
  if (!wbXml) return { book: "ThisWorkbook", sheets: [] };
  const wb = ensureWorkbookCodeName(wbXml);
  zip.file("xl/workbook.xml", wb.xml);
  const used = new Set([wb.codeName]);
  const sheets: string[] = [];
  let n = 1;
  for (const part of worksheetParts(wb.xml, (await read("xl/_rels/workbook.xml.rels")) ?? "")) {
    let xml = await read(part);
    if (!xml) continue;
    let name = sheetCodeName(xml);
    if (!name || used.has(name)) {
      while (used.has(`Sheet${n}`)) n += 1;
      name = `Sheet${n}`;
      xml = setSheetCodeName(xml, name);
      zip.file(part, xml);
    }
    used.add(name);
    sheets.push(name);
  }
  return { book: wb.codeName, sheets };
}

export async function buildWorkbookBlob(opts: SaveOptions): Promise<Blob> {
  const baseBytes = opts.originBytes ?? b64ToBytes(BLANK_XLSX_B64);
  const base = await JSZip.loadAsync(baseBytes);
  const out = new JSZip();
  const skip = new Set(["[Content_Types].xml", "_rels/.rels"]);
  const jobs: Promise<void>[] = [];
  base.forEach((path, file) => {
    if (file.dir) return;
    const norm = path.replace(/\\/g, "/");
    if (norm.toLowerCase().startsWith("customui/")) return;
    if (skip.has(norm)) return;
    jobs.push(
      file.async("uint8array").then((data) => {
        out.file(norm, data, { compression: /\.bin$/i.test(norm) ? "STORE" : "DEFLATE" });
      }),
    );
  });
  await Promise.all(jobs);

  let ct = await base.file("[Content_Types].xml")!.async("string");
  const relsFile = base.file("_rels/.rels");
  let rels = relsFile
    ? await relsFile.async("string")
    : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;

  const ui = generateCustomUi(opts.doc);
  ct = upsertCustomUiOverride(ensurePngDefault(ct));
  rels = upsertUiRelationship(rels);

  if (opts.includeVba) {
    ct = upsertVbaOverride(setMacroEnabledWorkbook(ct));
    const wbRelsPath = "xl/_rels/workbook.xml.rels";
    const wbRelsFile = out.file(wbRelsPath) ?? base.file(wbRelsPath);
    if (wbRelsFile) {
      const wbRels = upsertVbaRelationship(await wbRelsFile.async("string"));
      out.file(wbRelsPath, wbRels);
    }
    const existing = Object.keys(base.files).find((p) => /vbaProject\.bin$/i.test(p));
    if (existing && opts.hasExistingVba) {
      // 기존 VBA는 그대로 두고, 파일에 없는 매크로만 새 모듈로 더한다.
      if (opts.vbaSource.trim()) {
        const result = appendModule(await base.file(existing)!.async("uint8array"), opts.vbaSource);
        if (result.ok) {
          out.file(existing, result.bytes, { compression: "STORE" });
          if (opts.report) opts.report.appendedModule = result.moduleName;
        } else if (opts.report) {
          opts.report.vbaError = result.reason;
        }
      }
    } else {
      const host = await assignCodeNames(out);
      out.file("xl/vbaProject.bin", buildVbaProject(opts.vbaSource, host), { compression: "STORE" });
    }
  }

  out.file("[Content_Types].xml", ct);
  out.file("_rels/.rels", rels);
  out.file("customUI/customUI14.xml", ui);
  if (opts.images.length) {
    out.file("customUI/_rels/customUI14.xml.rels", imageRelsXml(opts.images));
    for (const img of opts.images) {
      out.file(`customUI/images/${img.id}.${img.ext || "png"}`, dataUrlToBytes(img.dataUrl));
    }
  }

  return out.generateAsync({
    type: "blob",
    mimeType: mimeOfSave(opts),
    compression: "DEFLATE",
  });
}
