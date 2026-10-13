import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BUILTIN_GROUPS } from "@/constants/idMso";
import { cloneTabAfter } from "@/model/clone";
import { createBuiltinGroup, createControl, createCustomTab, createGroup } from "@/model/factory";
import { IdIssuer } from "@/model/ids";
import { allXmlIds } from "@/model/walk";
import type { ControlType, RibbonDoc } from "@/model/types";
import { generateCustomUi } from "@/xml/generate";
import { parseCustomUi } from "@/xml/parse";
import { buildWorkbookBlob } from "./write";
import { openWorkbook } from "./read";
import { BLANK_XLSX_B64 } from "./blank";

const ALL: ControlType[] = [
  "button", "toggleButton", "checkBox", "editBox", "comboBox",
  "dropDown", "menu", "splitButton", "labelControl", "separator",
];

function bytesFromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}

function sampleDoc(): RibbonDoc {
  const issuer = new IdIssuer();
  const tab = createCustomTab(issuer, 1);
  tab.label = "사용자";
  const g1 = createGroup(issuer, "모두");
  for (const type of ALL) {
    const c = createControl(issuer, type);
    if (c.type === "button") c.onAction = "btn_ChatGPT";
    if (c.type === "menu") {
      const b = createControl(issuer, "button");
      if (b.type === "button") { b.label = "항목"; b.onAction = "mnu_Go"; c.items.push(b); }
    }
    g1.controls.push(c);
  }
  const g2 = createGroup(issuer, "둘째");
  for (const bg of BUILTIN_GROUPS) tab.groups.push(createBuiltinGroup(issuer, bg.idMso));
  tab.groups.splice(0, 0, g1, g2);
  return { tabs: [tab] };
}

describe("완료 기준 샘플", () => {
  it("10종 + 내장 그룹 파일을 만들고 다시 읽는다", async () => {
    const doc = sampleDoc();
    const { doc: clonedDoc } = cloneTabAfter(doc, doc.tabs[0].uid);
    expect(new Set(allXmlIds(clonedDoc)).size).toBe(allXmlIds(clonedDoc).length);
    const blob = await buildWorkbookBlob({
      originBytes: bytesFromB64(BLANK_XLSX_B64),
      originKind: "blank",
      fileName: "완료기준.xlsx",
      doc: clonedDoc,
      images: [],
      includeVba: false,
      vbaSource: "",
      hasExistingVba: false,
    });
    const buf = new Uint8Array(await blob.arrayBuffer());
    const out = resolve("_excel_out");
    mkdirSync(out, { recursive: true });
    try {
      writeFileSync(resolve(out, "complete.xlsx"), buf);
    } catch {
      writeFileSync(resolve(out, "complete_unlocked.xlsx"), buf);
    }
    const xml = generateCustomUi(clonedDoc);
    expect(xml).toContain('idMso="GroupCode"');
    expect(xml).toContain('idMso="GroupControls"');
    expect(xml).toContain('idMso="GroupXml"');
    const opened = await openWorkbook(buf.buffer, "complete.xlsx");
    expect(opened.ribbon.doc.tabs).toHaveLength(2);
    expect(opened.ribbon.doc.tabs[0].label).toBe("사용자");
    expect(opened.ribbon.doc.tabs[1].label).toBe("사용자 복사");
    const again = parseCustomUi(xml);
    expect(again.doc.tabs[0].groups.filter((g) => g.kind === "builtin").map((g) => g.kind === "builtin" && g.idMso)).toEqual([
      "GroupCode", "GroupControls", "GroupXml",
    ]);
  });
});
