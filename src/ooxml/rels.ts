const RELS_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
export const UI_REL_2007 = "http://schemas.microsoft.com/office/2007/relationships/ui/extensibility";
export const UI_REL_2006 = "http://schemas.microsoft.com/office/2006/relationships/ui/extensibility";
export const IMAGE_REL = "http://schemas.microsoft.com/office/2007/relationships/image";
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
