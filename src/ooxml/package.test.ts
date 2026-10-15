import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { createControl, createCustomTab, createGroup } from "@/model/factory";
import { IdIssuer } from "@/model/ids";
import { generateCustomUi } from "@/xml/generate";
import { openWorkbook } from "./read";
import { buildWorkbookBlob, downloadName } from "./write";
import { BLANK_XLSX_B64 } from "./blank";
import { UI_REL_2007, imageRelsXml } from "./rels";

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

describe("workbook package", () => {
  it("customUI와 관계를 넣고 원본 시트를 보존한다", async () => {
    const issuer = new IdIssuer();
    const tab = createCustomTab(issuer, 1);
    const group = createGroup(issuer, "추가");
    group.controls.push(createControl(issuer, "labelControl"));
    tab.groups.push(group);
    const blob = await buildWorkbookBlob({
      originBytes: b64ToBytes(BLANK_XLSX_B64),
      originKind: "blank",
      fileName: "새 통합문서.xlsx",
      doc: { tabs: [tab] },
      images: [],
      includeVba: false,
      vbaSource: "",
      hasExistingVba: false,
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const zip = await JSZip.loadAsync(bytes);
    expect(zip.file("customUI/customUI14.xml")).toBeTruthy();
    const rels = await zip.file("_rels/.rels")!.async("string");
    expect(rels).toContain(UI_REL_2007);
    expect(zip.file("xl/worksheets/sheet1.xml")).toBeTruthy();
    const xml = await zip.file("customUI/customUI14.xml")!.async("string");
    expect(xml).toBe(generateCustomUi({ tabs: [tab] }));

    const opened = await openWorkbook(bytes.buffer, "왕복.xlsx");
    expect(opened.ribbon.doc.tabs).toHaveLength(1);
    expect(opened.ribbon.doc.tabs[0].groups[0].kind).toBe("custom");
    if (opened.ribbon.doc.tabs[0].groups[0].kind === "custom") {
      expect(opened.ribbon.doc.tabs[0].groups[0].label).toBe("추가");
    }
  });

  it("원본 시트 셀 값을 바이트 그대로 보존한다", async () => {
    const originZip = await JSZip.loadAsync(b64ToBytes(BLANK_XLSX_B64));
    const marker = "기존값_RIBBON_KEEP";
    let sheet = await originZip.file("xl/worksheets/sheet1.xml")!.async("string");
    sheet = sheet.replace(
      "</sheetData>",
      `<row r="99"><c r="A99" t="inlineStr"><is><t>${marker}</t></is></c></row></sheetData>`,
    );
    originZip.file("xl/worksheets/sheet1.xml", sheet);
    const originBytes = await originZip.generateAsync({ type: "uint8array" });
    const issuer = new IdIssuer();
    const tab = createCustomTab(issuer, 1);
    tab.groups.push(createGroup(issuer, "보존"));
    const blob = await buildWorkbookBlob({
      originBytes,
      originKind: "xlsx",
      fileName: "기존.xlsx",
      doc: { tabs: [tab] },
      images: [],
      includeVba: false,
      vbaSource: "",
      hasExistingVba: false,
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const outSheet = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
    expect(outSheet).toContain(marker);
  });

  it("같은 관계를 두 번 넣지 않는다", async () => {
    const first = await buildWorkbookBlob({
      originBytes: b64ToBytes(BLANK_XLSX_B64),
      originKind: "blank",
      fileName: "a.xlsx",
      doc: { tabs: [] },
      images: [],
      includeVba: false,
      vbaSource: "",
      hasExistingVba: false,
    });
    const again = await buildWorkbookBlob({
      originBytes: new Uint8Array(await first.arrayBuffer()),
      originKind: "xlsx",
      fileName: "a.xlsx",
      doc: { tabs: [] },
      images: [],
      includeVba: false,
      vbaSource: "",
      hasExistingVba: false,
    });
    const zip = await JSZip.loadAsync(await again.arrayBuffer());
    const rels = await zip.file("_rels/.rels")!.async("string");
    expect(rels.match(/ui\/extensibility/g)?.length).toBe(1);
  });

  it("리본 이미지는 표준 이미지 관계 형식으로 연결한다", () => {
    const rels = imageRelsXml([{ id: "img_chatgpt", ext: "png" }]);
    expect(rels).toContain('Id="img_chatgpt" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="images/img_chatgpt.png"');
  });

  it("추가 기능·매크로 통합 문서는 확장자를 그대로 두고, .xlsx만 .xlsm으로 바꾼다", () => {
    const base = { originBytes: null, doc: { tabs: [] }, images: [], vbaSource: "", hasExistingVba: true, includeVba: true };
    // 추가 기능은 저장 시각을 붙여 같은 이름의 .xlam이 생기지 않게 한다.
    const at = new Date(2026, 9, 15, 17, 53);
    expect(downloadName({ ...base, originKind: "xlam", fileName: "도구.xlam" }, at)).toBe("도구_ribbon_1015_1753.xlam");
    expect(downloadName({ ...base, originKind: "xlam", fileName: "업무자동화_ribbon_1.xlam" }, at)).toBe("업무자동화_ribbon_1015_1753.xlam");
    expect(downloadName({ ...base, originKind: "xlam", fileName: "업무자동화_ribbon (2).xlam" }, at)).toBe("업무자동화_ribbon_1015_1753.xlam");
    // 앞서 받은 버전을 다시 불러와 저장해도 시각이 겹쳐 붙지 않는다.
    expect(downloadName({ ...base, originKind: "xlam", fileName: "도구_ribbon_1015_1753.xlam" }, new Date(2026, 9, 16, 9, 5))).toBe("도구_ribbon_1016_0905.xlam");
    expect(downloadName({ ...base, originKind: "xlsm", fileName: "a_ribbon.xlsm" })).toBe("a_ribbon.xlsm");
    expect(downloadName({ ...base, originKind: "xlsx", fileName: "b.xlsx" })).toBe("b_ribbon.xlsm");
    expect(downloadName({ ...base, originKind: "blank", fileName: "새 통합문서.xlsx" })).toBe("새 통합문서.xlsm");
  });
});
