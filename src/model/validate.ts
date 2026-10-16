import { KNOWN_IDMSO } from "@/constants/idMso";
import { isXmlId } from "./ids";
import { walkControls, walkGroups, walkTabs } from "./walk";
import { KIND_NAME, collectCallbacks, signatureConflicts } from "@/vba/generate";
import type { Issue, RibbonDoc } from "./types";
import type { VbaProblem } from "@/ovba/extract";

function macroOf(control: { type: string; onAction?: string; onChange?: string }): string {
  if (control.type === "editBox" || control.type === "comboBox") return control.onChange ?? "";
  return control.onAction ?? "";
}

/** 불러온 파일 VBA에서 읽은 정보 (store의 vbaProblems·vbaTaken·vbaHidden). */
export interface FileVbaInfo {
  problems: VbaProblem[];
  taken: string[];
  hidden: Record<string, string>;
}

export function validateDoc(
  doc: RibbonDoc,
  imageIds: Set<string>,
  macros: { name: string; source?: string }[] = [],
  fileVba: FileVbaInfo = { problems: [], taken: [], hidden: {} },
): Issue[] {
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
    // 실행 매크로 없이 "초기값" 칸만 채운 경우: 학생이 칸을 헷갈린 것이다. 골라도·눌러도 아무 일이 일어나지 않는다.
    if (control.type === "dropDown") {
      if (control.getSelectedItemID && !control.onAction) {
        issues.push({
          level: "error",
          uid: control.uid,
          message: `"${control.label}" 드롭다운의 매크로("${control.getSelectedItemID}")가 getSelectedItemID 칸에 들어 있습니다. 항목을 골랐을 때 실행하려면 onAction 칸으로 옮기고 getSelectedItemID는 비우세요.`,
        });
      } else if (!control.onAction) {
        issues.push({ level: "warn", uid: control.uid, message: `"${control.label}" 드롭다운에 onAction 매크로가 없어 항목을 골라도 아무 일도 일어나지 않습니다.` });
      }
    }
    if ((control.type === "toggleButton" || control.type === "checkBox") && control.getPressed && !control.onAction) {
      issues.push({
        level: "warn",
        uid: control.uid,
        message: `"${control.label}"의 매크로("${control.getPressed}")가 getPressed 칸에 들어 있습니다. 누를 때 실행하려면 onAction 칸으로 옮기고 getPressed는 비우세요.`,
      });
    }
    if (control.type === "button" && !control.onAction) {
      issues.push({ level: "warn", uid: control.uid, message: `"${control.label || control.id}" 단추에 매크로가 연결되지 않아 눌러도 아무 일도 일어나지 않습니다.` });
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
  // 파일 VBA 자체의 문제: 빌더가 고칠 수 없고, 그대로 두면 저장한 파일의 리본 매크로가 멈춘다.
  const ribbonNames = new Set(collectCallbacks(doc).map((c) => c.name.toLowerCase()));
  for (const p of fileVba.problems) {
    issues.push({
      level: p.compileError || ribbonNames.has(p.name.toLowerCase()) ? "error" : "warn",
      uid: "",
      message: `[엑셀 VBA] ${p.message} 고친 뒤 엑셀에서 저장(Ctrl+S)하면 빌더가 저장할 때 다시 읽습니다.`,
    });
  }
  const callable = new Set(macros.filter((m) => m.source === "file").map((m) => m.name.toLowerCase()));
  const taken = new Set(fileVba.taken);
  for (const name of new Set(collectCallbacks(doc).map((c) => c.name))) {
    const lower = name.toLowerCase();
    if (callable.has(lower)) continue;
    // 표준 모듈에 같은 이름의 Function 등이 있으면 새 Sub를 더할 때 "모호한 이름" 오류가 난다.
    if (taken.has(lower)) {
      issues.push({ level: "error", uid: "", message: `파일 VBA에 "${name}"라는 이름의 Function(또는 다른 형태)이 이미 있어 리본용 Sub를 만들 수 없습니다. 매크로 이름을 바꾸세요.` });
      continue;
    }
    const hiddenKey = Object.keys(fileVba.hidden).find((k) => k.toLowerCase() === lower);
    if (hiddenKey) {
      issues.push({
        level: "warn",
        uid: "",
        message: `파일의 "${hiddenKey}"는 ${fileVba.hidden[hiddenKey]}이라 리본이 부를 수 없습니다. 같은 이름의 새 Sub를 RibbonCallbacks 모듈에 만듭니다. 실제 코드는 표준 모듈(삽입 → 모듈)로 옮기세요.`,
      });
    }
  }
  for (const m of macros) {
    // 파일의 VBA에 원래 있던 Sub는 다른 코드에서 부르는 도우미일 수 있어 경고하지 않는다.
    if (m.source === "file") continue;
    if (!usedMacros.has(m.name)) issues.push({ level: "warn", uid: "", message: `사용하지 않는 매크로 "${m.name}" 입니다.` });
  }

  return issues;
}
