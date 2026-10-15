import { walkControls } from "@/model/walk";
import type { CallbackKind, Control, ListItem, MacroDef, RibbonDoc } from "@/model/types";

const SIG: Record<CallbackKind, string> = {
  button: "control As IRibbonControl",
  pressed: "control As IRibbonControl, pressed As Boolean",
  text: "control As IRibbonControl, text As String",
  dropdown: "control As IRibbonControl, id As String, index As Integer",
  getval: "control As IRibbonControl, ByRef returnedVal",
  selitem: "control As IRibbonControl, ByRef returnedVal",
  onload: "ribbon As IRibbonUI",
};

export interface CallbackRef {
  name: string;
  kind: CallbackKind;
  uid: string;
  label?: string;
  controlId?: string;
  /** 매크로가 연결된 속성 이름 (onAction, getText …). */
  key?: string;
  /** 드롭다운 항목 — 콜백 코드에 항목 id를 넣는 데 쓴다. */
  items?: ListItem[];
}

function push(list: CallbackRef[], name: string, kind: CallbackKind, uid: string, label?: string, controlId?: string, key?: string): void {
  if (name) list.push({ name, kind, uid, label, controlId, key });
}

export function collectCallbacks(doc: RibbonDoc): CallbackRef[] {
  const list: CallbackRef[] = [];
  if (doc.settings?.onLoad) push(list, doc.settings.onLoad, "onload", "settings", undefined, undefined, "onLoad");
  walkControls(doc, (c) => addControlCallbacks(c, list));
  return list;
}

function addControlCallbacks(c: Control, list: CallbackRef[]): void {
  const label = c.type === "splitButton" ? c.button.label : c.label;
  switch (c.type) {
    case "button":
      push(list, c.onAction, "button", c.uid, label, c.id, "onAction");
      break;
    case "toggleButton":
    case "checkBox":
      push(list, c.onAction, "pressed", c.uid, label, c.id, "onAction");
      push(list, c.getPressed, "getval", c.uid, label, c.id, "getPressed");
      break;
    case "editBox":
    case "comboBox":
      push(list, c.onChange, "text", c.uid, label, c.id, "onChange");
      push(list, c.getText, "getval", c.uid, label, c.id, "getText");
      break;
    case "dropDown": {
      const from = list.length;
      push(list, c.onAction, "dropdown", c.uid, label, c.id, "onAction");
      push(list, c.getSelectedItemID, "selitem", c.uid, label, c.id, "getSelectedItemID");
      for (let i = from; i < list.length; i++) list[i].items = c.items;
      break;
    }
    default:
      break;
  }
}

/**
 * 리본에서 연결이 끊긴 매크로를 목록에서 뺀다 (컨트롤을 지우거나 다른 매크로로 바꾼 경우).
 * 파일의 VBA에 있는 것, 매크로 관리에서 직접 등록한 것, 본문이 있는 것은 남긴다.
 */
export function pruneMacros(doc: RibbonDoc, macros: MacroDef[]): MacroDef[] {
  const used = new Set(collectCallbacks(doc).map((c) => c.name));
  return macros.filter((m) => m.source === "file" || m.pinned || m.body || used.has(m.name));
}

/** 콜백 칸(컨트롤 종류 + 속성 이름)이 요구하는 VBA 서명 종류. */
export function fieldKind(controlType: string, key: string): CallbackKind {
  if (key === "getPressed" || key === "getText") return "getval";
  if (key === "getSelectedItemID") return "selitem";
  if (key === "onLoad") return "onload";
  if (controlType === "toggleButton" || controlType === "checkBox") return "pressed";
  if (controlType === "editBox" || controlType === "comboBox") return "text";
  if (controlType === "dropDown") return "dropdown";
  return "button";
}

export const KIND_NAME: Record<CallbackKind, string> = {
  button: "버튼 클릭",
  pressed: "눌림·체크 변경",
  text: "값 입력",
  dropdown: "드롭다운 선택",
  getval: "초기값",
  selitem: "초기 선택 항목",
  onload: "리본 로드",
};

export function sameSignature(a: CallbackKind, b: CallbackKind): boolean {
  return SIG[a] === SIG[b];
}

/**
 * name을 (uid, key) 칸에 연결하면 서명이 어긋나는 다른 사용처를 돌려준다.
 * 하나의 Sub는 서명이 하나뿐이라, 예를 들어 버튼과 드롭다운이 같은 매크로를 쓰면 한쪽은 엑셀에서 실행되지 않는다.
 */
export function signatureClash(doc: RibbonDoc, name: string, kind: CallbackKind, uid: string, key: string): CallbackRef | undefined {
  return collectCallbacks(doc).find((r) => r.name === name && !(r.uid === uid && r.key === key) && !sameSignature(r.kind, kind));
}

/** 서로 다른 서명으로 함께 쓰인 매크로 목록. */
export function signatureConflicts(doc: RibbonDoc): { name: string; refs: CallbackRef[] }[] {
  const byName = new Map<string, CallbackRef[]>();
  for (const r of collectCallbacks(doc)) byName.set(r.name, [...(byName.get(r.name) ?? []), r]);
  return [...byName].filter(([, refs]) => refs.some((r) => !sameSignature(r.kind, refs[0].kind))).map(([name, refs]) => ({ name, refs }));
}

const RULE = "' " + "=".repeat(70);

export interface GenerateOptions {
  /** true면 파일 안 모듈에 넣을 코드라 붙여넣기 안내를 뺀다. */
  embedded?: boolean;
  /**
   * true면 이미 VBA가 있는 파일에 새 모듈로 더할 코드만 만든다: 파일에 없는 매크로의 Sub만 넣고,
   * 기존 모듈과 겹칠 수 있는 MyRibbon·RefreshRibbon은 뺀다. 더할 것이 없으면 빈 문자열.
   */
  appendOnly?: boolean;
}

/** 매크로 하나의 본문 (Sub와 End Sub 사이). */
function stubBody(name: string, kind: CallbackKind, refs: CallbackRef[]): string[] {
  const one = refs.length === 1 ? refs[0] : undefined;
  switch (kind) {
    case "onload":
      return ["    Set MyRibbon = ribbon"];
    case "dropdown":
      return ["    ' TODO: 선택된 항목 처리 (id / index)"];
    case "selitem": {
      const first = one?.items?.[0]?.id;
      return ["    ' TODO: 처음 선택될 항목의 id를 돌려주세요", `    returnedVal = \"${(first ?? "").replace(/"/g, '""')}\"`];
    }
    case "getval":
      // 리본이 그려질 때마다 불리므로 MsgBox 대신 값을 돌려준다.
      return one?.key === "getText"
        ? ["    ' TODO: 처음 보여줄 텍스트를 돌려주세요", '    returnedVal = ""']
        : ["    ' TODO: 처음 눌림·체크 상태를 돌려주세요", "    returnedVal = False"];
    default:
      if (refs.length > 1 && refs.every((r) => r.controlId)) {
        const rows = ["    ' TODO: 매크로 코드를 작성하세요", "    Select Case control.ID"];
        for (const r of refs) {
          rows.push(`        Case \"${(r.controlId ?? "").replace(/"/g, '""')}\"   ' ${r.label || r.controlId}`);
          rows.push(`            MsgBox \"${name} 호출됨 (${r.controlId})\"`);
        }
        rows.push("    End Select");
        return rows;
      }
      return ["    ' TODO: 매크로 코드를 작성하세요", `    MsgBox \"${name} 호출됨\"`];
  }
}

export function generateVba(doc: RibbonDoc, macros: MacroDef[] = [], options: GenerateOptions = {}): string {
  // VBA 이름은 대소문자를 가리지 않는다.
  const skip = new Set(macros.filter((m) => m.source === "file").map((m) => m.name.toLowerCase()));
  const bodies = new Map(macros.filter((m) => m.body).map((m) => [m.name, m.body!]));
  const all = collectCallbacks(doc);
  const callbacks = all.filter((c) => !skip.has(c.name.toLowerCase()));
  if (options.appendOnly && !callbacks.length) return "";
  if (!callbacks.length && all.length) {
    return `' 연결된 매크로는 모두 이 파일의 VBA에 이미 있습니다.\r\n' 새로 붙여 넣을 코드가 없습니다.\r\n`;
  }
  if (!callbacks.length) {
    return `' 연결된 매크로가 없습니다.\r\n' 컨트롤 속성에서 매크로를 고르면 여기에 코드가 만들어집니다.\r\n`;
  }
  const first = new Map<string, CallbackKind>();
  const owners = new Map<string, CallbackRef[]>();
  const conflicts: string[] = [];
  for (const c of callbacks) {
    if (!first.has(c.name)) first.set(c.name, c.kind);
    else if (!sameSignature(first.get(c.name)!, c.kind)) conflicts.push(c.name);
    const list = owners.get(c.name) ?? [];
    list.push(c);
    owners.set(c.name, list);
  }
  const lines = options.appendOnly ? [
    RULE,
    "' Excel Ribbon Builder가 추가한 매크로 (기존 VBA 코드는 그대로 둡니다)",
    RULE,
    "Option Explicit",
    "",
  ] : [
    RULE,
    "' Excel Ribbon Builder 생성 코드 (새로 추가한 매크로만)",
    ...(options.embedded ? [] : ["' 사용법: Alt+F11 → 삽입 → 모듈 → 아래 전체를 붙여넣기"]),
    RULE,
    "Option Explicit",
    "",
    "' onLoad 콜백에서 할당 - 이후 리본을 동적으로 무효화할 때 필요",
    "Public MyRibbon As IRibbonUI",
    "",
  ];
  if (conflicts.length) {
    lines.push("' 경고: 같은 매크로가 서로 다른 콜백 종류에 쓰였습니다. 처음 쓰인 서명을 따릅니다.");
    lines.push("' " + [...new Set(conflicts)].join(", "));
    lines.push("");
  }
  // 이름순으로 정렬해 VBA 편집기에서 찾기 쉽게 한다.
  for (const [name, kind] of [...first].sort(([a], [b]) => a.localeCompare(b, "en"))) {
    lines.push(`Sub ${name}(${SIG[kind]})`);
    if (kind === "onload" && options.appendOnly) {
      lines.push("    ' TODO: 필요하면 ribbon 개체를 모듈 변수에 저장하세요");
    } else if (kind !== "onload" && bodies.has(name)) {
      for (const row of bodies.get(name)!.split(/\r?\n/)) lines.push(row ? `    ${row}` : "");
    } else {
      lines.push(...stubBody(name, kind, owners.get(name) ?? []));
    }
    lines.push("End Sub");
    lines.push("");
  }
  if (options.appendOnly) return lines.join("\r\n");
  if (doc.settings?.onLoad) {
    lines.push("Sub RefreshRibbon()");
    lines.push("    If Not MyRibbon Is Nothing Then MyRibbon.Invalidate");
    lines.push("End Sub");
    lines.push("");
  }
  return lines.join("\r\n");
}

/** 화면에 보여 줄 VBA: 기존 VBA가 있는 파일이면 실제로 더해질 코드만 보여 준다. */
export function panelVba(doc: RibbonDoc, macros: MacroDef[], hasExistingVba: boolean): string {
  return (hasExistingVba && generateVba(doc, macros, { appendOnly: true })) || generateVba(doc, macros);
}

export { SIG };

/**
 * 파일 VBA에서 읽은 매개변수(괄호 안)가 콜백 칸이 요구하는 형식과 맞지 않으면 그 이유를 돌려준다.
 * 매개변수를 모르면(직접 등록한 매크로 등) 맞는 것으로 본다.
 */
export function paramsMismatch(params: string | undefined, kind: CallbackKind): string | undefined {
  if (params === undefined) return undefined;
  const got = params.split(",").map((p) => p.trim()).filter(Boolean);
  const want = SIG[kind].split(",");
  if (!got.length) return "매개변수가 없는 일반 매크로라 리본에 바로 연결할 수 없음";
  const reason = `${KIND_NAME[kind]}용 형식(${SIG[kind]})이 아니라 쓸 수 없음`;
  if (got.length !== want.length) return reason;
  const typeOf = (p: string) => /\bAs\s+([A-Za-z_][A-Za-z0-9_.]*)/i.exec(p)?.[1]?.toLowerCase();
  const first = typeOf(got[0]);
  if (first && first !== (kind === "onload" ? "iribbonui" : "iribboncontrol")) return reason;
  if (got.length === 2) {
    const second = typeOf(got[1]);
    if (kind === "pressed" && second && second !== "boolean") return reason;
    if (kind === "text" && second && second !== "string") return reason;
  }
  return undefined;
}
