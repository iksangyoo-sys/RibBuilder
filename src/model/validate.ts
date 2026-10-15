import { KNOWN_IDMSO } from "@/constants/idMso";
import { isXmlId } from "./ids";
import { walkControls, walkGroups, walkTabs } from "./walk";
import { KIND_NAME, collectCallbacks, signatureConflicts } from "@/vba/generate";
import type { Issue, RibbonDoc } from "./types";

function macroOf(control: { type: string; onAction?: string; onChange?: string }): string {
  if (control.type === "editBox" || control.type === "comboBox") return control.onChange ?? "";
  return control.onAction ?? "";
}

export function validateDoc(doc: RibbonDoc, imageIds: Set<string>, macros: { name: string; source?: string }[] = []): Issue[] {
  const issues: Issue[] = [];
  const seen = new Map<string, string>();
  const keytips = new Map<string, string>();

  const checkId = (id: string, uid: string, who: string) => {
    if (!id) issues.push({ level: "error", uid, message: `${who} id가 비어 있습니다.` });
    else if (!isXmlId(id)) issues.push({ level: "error", uid, message: `${who} id "${id}" 는 XML에서 쓸 수 없습니다.` });
    else if (seen.has(id)) issues.push({ level: "error", uid, message: `id "${id}" 가 중복입니다.` });
    else seen.set(id, uid);
  };

  walkTabs(doc, (tab) => {
    if (tab.kind === "custom") {
      checkId(tab.id, tab.uid, "탭");
      if (!tab.label.trim()) issues.push({ level: "error", uid: tab.uid, message: "탭 레이블이 비어 있습니다." });
      if (tab.label.length > 32) issues.push({ level: "warn", uid: tab.uid, message: "탭 레이블이 너무 깁니다." });
      if (tab.keytip) {
        if (keytips.has(tab.keytip)) issues.push({ level: "warn", uid: tab.uid, message: `keytip "${tab.keytip}" 가 중복입니다.` });
        else keytips.set(tab.keytip, tab.uid);
      }
    } else if (tab.idMso && !KNOWN_IDMSO.has(tab.idMso) && tab.idMso !== "TabDraw") {
      issues.push({ level: "error", uid: tab.uid, message: `목록에 없는 idMso "${tab.idMso}" 입니다.` });
    }
    const builtins = tab.groups.filter((g) => g.kind === "builtin").map((g) => g.idMso);
    const dup = builtins.filter((id, i) => builtins.indexOf(id) !== i);
    for (const id of new Set(dup)) {
      const g = tab.groups.find((x) => x.kind === "builtin" && x.idMso === id);
      if (g) issues.push({ level: "error", uid: g.uid, message: `한 탭에 내장 그룹 "${id}" 이(가) 두 번 들어 있습니다.` });
    }
  });

  walkGroups(doc, (group) => {
    if (group.kind === "custom") {
      checkId(group.id, group.uid, "그룹");
      if (!group.label.trim()) issues.push({ level: "error", uid: group.uid, message: "그룹 레이블이 비어 있습니다." });
      if (!group.controls.length) issues.push({ level: "warn", uid: group.uid, message: "빈 그룹입니다." });
    } else if (group.idMso && !KNOWN_IDMSO.has(group.idMso)) {
      issues.push({ level: "error", uid: group.uid, message: `목록에 없는 내장 그룹 "${group.idMso}" 입니다.` });
    }
  });

  const usedMacros = new Set<string>();
  walkControls(doc, (control) => {
    if (control.type === "unknown") return;
    checkId(control.id, control.uid, "컨트롤");
    if (control.type === "splitButton") {
      checkId(control.menuId, control.uid, "분할 메뉴");
      if (!control.button?.id) issues.push({ level: "error", uid: control.uid, message: "분할버튼에 기본 버튼이 없습니다." });
    }
    if (control.type !== "separator" && control.type !== "splitButton" && !control.label.trim()) {
      issues.push({ level: "error", uid: control.uid, message: "레이블이 비어 있습니다." });
    }
    if (control.type === "splitButton" && !control.button.label.trim()) {
      issues.push({ level: "error", uid: control.button.uid, message: "주 버튼 레이블이 비어 있습니다." });
    }
    const linked = macroOf(control);
    if (linked) usedMacros.add(linked);
    if (control.imageId && !imageIds.has(control.imageId)) {
      issues.push({ level: "error", uid: control.uid, message: `없는 이미지 "${control.imageId}" 를 참조합니다.` });
    }
    if ((control.type === "button" || control.type === "toggleButton") && !control.label.trim() && !control.imageMso && !control.imageId) {
      issues.push({ level: "warn", uid: control.uid, message: "레이블과 아이콘이 모두 없습니다." });
    }
    if (control.label.length > 40) issues.push({ level: "warn", uid: control.uid, message: "레이블이 너무 깁니다." });
    if (control.keytip) {
      if (keytips.has(control.keytip)) issues.push({ level: "warn", uid: control.uid, message: `keytip "${control.keytip}" 가 중복입니다.` });
      else keytips.set(control.keytip, control.uid);
    }
    if (control.type === "comboBox" || control.type === "dropDown") {
      if (!control.items.length) issues.push({ level: "warn", uid: control.uid, message: "항목이 없습니다." });
      for (const it of control.items) {
        checkId(it.id, control.uid, "항목");
        if (!it.label.trim()) issues.push({ level: "error", uid: control.uid, message: "항목 레이블이 비어 있습니다." });
      }
    }
  });

  // getPressed·getText·getSelectedItemID·onLoad 같은 콜백에 연결된 매크로도 사용 중으로 본다.
  for (const cb of collectCallbacks(doc)) usedMacros.add(cb.name);
  // 한 Sub는 서명이 하나뿐이라, 서명이 다른 콜백끼리 같은 매크로를 쓰면 엑셀에서 한쪽이 실행되지 않는다.
  for (const { name, refs } of signatureConflicts(doc)) {
    const uses = refs.map((r) => `${r.label || r.controlId || "리본"}(${KIND_NAME[r.kind]})`).join(", ");
    issues.push({
      level: "error",
      uid: refs.find((r) => r.uid !== "settings")?.uid ?? "",
      message: `매크로 "${name}"가 형식이 다른 콜백에 함께 쓰였습니다: ${uses}. 하나를 다른 매크로로 바꾸세요.`,
    });
  }
  for (const m of macros) {
    // 파일의 VBA에 원래 있던 Sub는 다른 코드에서 부르는 도우미일 수 있어 경고하지 않는다.
    if (m.source === "file") continue;
    if (!usedMacros.has(m.name)) issues.push({ level: "warn", uid: "", message: `사용하지 않는 매크로 "${m.name}" 입니다.` });
  }

  return issues;
}
