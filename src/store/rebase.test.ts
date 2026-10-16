import { describe, expect, it } from "vitest";
import { IdIssuer } from "@/model/ids";
import { createControl, createCustomTab, createGroup, emptyRibbon } from "@/model/factory";
import type { Control } from "@/model/types";
import { buildWorkbookBlob } from "@/ooxml/write";
import { readVbaModules } from "@/ooxml/read";
import { useEditorStore } from "./useEditorStore";
import { generateVba } from "@/vba/generate";
import { appendModule } from "@/ovba/append";
import JSZip from "jszip";

async function save(): Promise<Uint8Array> {
  const s = useEditorStore.getState();
  const blob = await buildWorkbookBlob({
    originBytes: s.originBytes,
    originKind: s.originKind,
    fileName: s.fileName,
    doc: s.ribbon,
    images: s.images,
    includeVba: true,
    vbaSource: generateVba(s.ribbon, s.macros, { embedded: true, appendOnly: s.hasExistingVba }),
    hasExistingVba: s.hasExistingVba,
    report: {},
  });
  return new Uint8Array(await blob.arrayBuffer());
}

/** 학생이 엑셀에서 VBA를 쓰고 저장한 것처럼, 파일의 vbaProject.bin에 모듈을 더한다. */
async function editInExcel(bytes: Uint8Array, code: string): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(bytes);
  const result = appendModule(await zip.file("xl/vbaProject.bin")!.async("uint8array"), code, "Module1");
  if (!result.ok) throw new Error(result.reason);
  zip.file("xl/vbaProject.bin", result.bytes);
  return zip.generateAsync({ type: "uint8array" });
}

describe("저장 → 엑셀에서 VBA 작성 → 다시 저장", () => {
  it("엑셀에서 쓴 모듈을 지키고, 같은 콜백을 두 번 만들지 않는다", async () => {
    const store = useEditorStore.getState();
    store.startBlank();
    const issuer = new IdIssuer();
    const doc = emptyRibbon();
    const tab = createCustomTab(issuer, 1);
    const group = createGroup(issuer, "그룹 1");
    const btn = createControl(issuer, "button") as Extract<Control, { type: "button" }>;
    btn.onAction = "btn_A";
    group.controls.push(btn);
    tab.groups.push(group);
    doc.tabs.push(tab);
    useEditorStore.setState({ ribbon: doc, macros: [{ name: "btn_A", source: "builder" }] });

    // 1차 저장 후, 그 파일을 바탕으로 삼는다 (App이 저장 직후 하는 일).
    const first = await save();
    await useEditorStore.getState().rebase(first, "새 통합문서.xlsm");
    expect(useEditorStore.getState().macros.find((m) => m.name === "btn_A")?.source).toBe("file");

    // 학생이 엑셀에서 Module1에 코드를 쓰고 저장했다.
    const edited = await editInExcel(first, "Sub 폴더내엑셀파일취합()\r\n    MsgBox \"취합\"\r\nEnd Sub\r\n");
    await useEditorStore.getState().rebase(edited, "새 통합문서.xlsm");

    // 단추를 하나 더 달고 다시 저장.
    const s = useEditorStore.getState();
    const ribbon = structuredClone(s.ribbon);
    const btn2 = createControl(new IdIssuer(["btn_1", "grp_1", "tab_1", "btn_2"]), "button") as Extract<Control, { type: "button" }>;
    btn2.onAction = "btn_B";
    (ribbon.tabs.find((t) => t.kind === "custom")!.groups[0] as { controls: Control[] }).controls.push(btn2);
    useEditorStore.setState({ ribbon, macros: [...s.macros, { name: "btn_B", source: "builder" }] });
    const second = await save();

    const modules = await readVbaModules(second);
    const all = modules.map((m) => m.code).join("\n");
    expect(all).toContain("폴더내엑셀파일취합");
    expect(all.match(/Sub btn_A\(/g)).toHaveLength(1);
    expect(all.match(/Sub btn_B\(/g)).toHaveLength(1);
  });
});
