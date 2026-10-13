const RELS_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
export const UI_REL_2007 = "http://schemas.microsoft.com/office/2007/relationships/ui/extensibility";
export const UI_REL_2006 = "http://schemas.microsoft.com/office/2006/relationships/ui/extensibility";
// 리본 이미지는 표준 이미지 관계 형식이어야 엑셀이 찾는다 (office/2007/... 형식은 무시되어 아이콘이 안 보인다).
export const IMAGE_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";
export const VBA_REL = "http://schemas.microsoft.com/office/2006/relationships/vbaProject";

export function parseRelationships(xml: string): { id: string; type: string; target: string }[] {
  const out: { id: string; type: string; target: string }[] = [];
  const re = /<Relationship\b([^>]*)\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const chunk = m[1];
    const id = /Id="([^"]+)"/i.exec(chunk)?.[1] ?? "";
    const type = /Type="([^"]+)"/i.exec(chunk)?.[1] ?? "";
    const target = /Target="([^"]+)"/i.exec(chunk)?.[1] ?? "";
    out.push({ id, type, target });
  }
  return out;
}

function nextRelId(used: Set<string>, base: string): string {
  if (!used.has(base)) return base;
  let n = 1;
  while (used.has(base + n)) n += 1;
  return base + n;
}

export function upsertUiRelationship(xml: string): string {
  let s = xml.replace(/<Relationship\b[^>]*(?:Type="[^"]*ui\/extensibility[^"]*"|Target="[^"]*customUI[^"]*")[^>]*\/?>/gi, "");
  const used = new Set(parseRelationships(s).map((r) => r.id));
  const id = nextRelId(used, "rIdRibbon");
  const rel = `<Relationship Id="${id}" Type="${UI_REL_2007}" Target="customUI/customUI14.xml"/>`;
  if (!/<\/Relationships>/i.test(s)) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${RELS_NS}">${rel}</Relationships>`;
  }
  return s.replace(/<\/Relationships>/i, `${rel}</Relationships>`);
}

export function imageRelsXml(images: { id: string; ext: string }[]): string {
  const rels = images
    .map((img) => `<Relationship Id="${img.id}" Type="${IMAGE_REL}" Target="images/${img.id}.${img.ext}"/>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${RELS_NS}">${rels}</Relationships>`;
}

export function ensurePngDefault(contentTypes: string): string {
  if (/Extension="png"/i.test(contentTypes)) return contentTypes;
  return contentTypes.replace(/<Types\b([^>]*)>/i, `<Types$1><Default Extension="png" ContentType="image/png"/>`);
}

export function upsertCustomUiOverride(contentTypes: string): string {
  let s = contentTypes.replace(/<Override\b[^>]*PartName="[^"]*customUI[^"]*"[^>]*\/?>/gi, "");
  return s.replace(/<\/Types>/i, `<Override PartName="/customUI/customUI14.xml" ContentType="application/xml"/></Types>`);
}

export function setMacroEnabledWorkbook(contentTypes: string): string {
  return contentTypes
    .replace(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
      "application/vnd.ms-excel.sheet.macroEnabled.main+xml",
    )
    .replace(
      "application/vnd.ms-excel.sheet.macroEnabled.main+xml",
      "application/vnd.ms-excel.sheet.macroEnabled.main+xml",
    );
}

export function upsertVbaOverride(contentTypes: string): string {
  if (/vbaProject\.bin/i.test(contentTypes)) return contentTypes;
  return contentTypes.replace(
    /<\/Types>/i,
    `<Override PartName="/xl/vbaProject.bin" ContentType="application/vnd.ms-office.vbaProject"/></Types>`,
  );
}

export function upsertVbaRelationship(workbookRels: string): string {
  if (/vbaProject/i.test(workbookRels)) return workbookRels;
  const used = new Set(parseRelationships(workbookRels).map((r) => r.id));
  const id = nextRelId(used, "rIdVba");
  const rel = `<Relationship Id="${id}" Type="${VBA_REL}" Target="vbaProject.bin"/>`;
  return workbookRels.replace(/<\/Relationships>/i, `${rel}</Relationships>`);
}

export function resolvePath(baseFile: string, target: string): string {
  if (target.startsWith("/")) return target.replace(/^\/+/, "");
  const dir = baseFile.split("/").slice(0, -1);
  for (const seg of target.split("/")) {
    if (seg === "..") dir.pop();
    else if (seg && seg !== ".") dir.push(seg);
  }
  return dir.join("/");
}

export function relsPathFor(part: string): string {
  const bits = part.split("/");
  const file = bits.pop()!;
  return [...bits, "_rels", `${file}.rels`].join("/");
}

const WORKSHEET_REL = /\/relationships\/worksheet$/;

/** workbookPr codeName을 돌려준다. 없으면 ThisWorkbook으로 정해 넣는다 (fileVersion·fileSharing 뒤가 스키마 순서). */
export function ensureWorkbookCodeName(workbookXml: string): { xml: string; codeName: string } {
  const existing = /<workbookPr\b[^>]*\bcodeName="([^"]+)"/.exec(workbookXml)?.[1];
  if (existing) return { xml: workbookXml, codeName: existing };
  if (/<workbookPr\b/.test(workbookXml)) {
    return { xml: workbookXml.replace(/<workbookPr\b/, '<workbookPr codeName="ThisWorkbook"'), codeName: "ThisWorkbook" };
  }
  const anchor = [
    /<fileSharing\b[^>]*\/>|<fileSharing\b[\s\S]*?<\/fileSharing>/,
    /<fileVersion\b[^>]*\/>/,
    /<workbook\b[^>]*>/,
  ].find((re) => re.test(workbookXml));
  if (!anchor) return { xml: workbookXml, codeName: "ThisWorkbook" };
  return { xml: workbookXml.replace(anchor, (m) => `${m}<workbookPr codeName="ThisWorkbook"/>`), codeName: "ThisWorkbook" };
}

export function sheetCodeName(sheetXml: string): string | undefined {
  return /<sheetPr\b[^>]*\bcodeName="([^"]+)"/.exec(sheetXml)?.[1];
}

/** sheetPr codeName을 바꾸거나 넣는다. sheetPr은 worksheet의 첫 자식이다. */
export function setSheetCodeName(sheetXml: string, codeName: string): string {
  if (/<sheetPr\b[^>]*\bcodeName="/.test(sheetXml)) return sheetXml.replace(/(<sheetPr\b[^>]*\bcodeName=")[^"]*"/, `$1${codeName}"`);
  if (/<sheetPr\b/.test(sheetXml)) return sheetXml.replace(/<sheetPr\b/, `<sheetPr codeName="${codeName}"`);
  return sheetXml.replace(/(<worksheet\b[^>]*>)/, `$1<sheetPr codeName="${codeName}"/>`);
}

/** 통합 문서 순서대로 워크시트 파트 경로를 돌려준다. */
export function worksheetParts(workbookXml: string, workbookRels: string): string[] {
  const targets = new Map(parseRelationships(workbookRels).filter((r) => WORKSHEET_REL.test(r.type)).map((r) => [r.id, r.target]));
  const parts: string[] = [];
  for (const m of workbookXml.matchAll(/<sheet\b[^>]*>/g)) {
    const rid = /\br:id="([^"]+)"/.exec(m[0])?.[1];
    const target = rid ? targets.get(rid) : undefined;
    if (target) parts.push(resolvePath("xl/workbook.xml", target));
  }
  return parts;
}
