import { walkControls } from "@/model/walk";
import type { CallbackKind, Control, MacroDef, RibbonDoc } from "@/model/types";

const SIG: Record<CallbackKind, string> = {
  button: "control As IRibbonControl",
  pressed: "control As IRibbonControl, pressed As Boolean",
  text: "control As IRibbonControl, text As String",
  dropdown: "control As IRibbonControl, id As String, index As Integer",
  getval: "control As IRibbonControl, ByRef returnedVal",
  onload: "ribbon As IRibbonUI",
};

export interface CallbackRef {
  name: string;
  kind: CallbackKind;
  uid: string;
  label?: string;
  controlId?: string;
}

function push(list: CallbackRef[], name: string, kind: CallbackKind, uid: string, label?: string, controlId?: string): void {
  if (name) list.push({ name, kind, uid, label, controlId });
}

export function collectCallbacks(doc: RibbonDoc): CallbackRef[] {
  const list: CallbackRef[] = [];
  if (doc.settings?.onLoad) push(list, doc.settings.onLoad, "onload", "settings");
  walkControls(doc, (c) => addControlCallbacks(c, list));
  return list;
}

function addControlCallbacks(c: Control, list: CallbackRef[]): void {
  const label = c.type === "splitButton" ? c.button.label : c.label;
  switch (c.type) {
    case "button":
      push(list, c.onAction, "button", c.uid, label, c.id);
      break;
    case "toggleButton":
    case "checkBox":
      push(list, c.onAction, "pressed", c.uid, label, c.id);
      push(list, c.getPressed, "getval", c.uid, label, c.id);
      break;
    case "editBox":
    case "comboBox":
      push(list, c.onChange, "text", c.uid, label, c.id);
      push(list, c.getText, "getval", c.uid, label, c.id);
      break;
    case "dropDown":
      push(list, c.onAction, "dropdown", c.uid, label, c.id);
      break;
    default:
      break;
  }
}

export function generateVba(doc: RibbonDoc, macros: MacroDef[] = []): string {
  const skip = new Set(macros.filter((m) => m.source === "file").map((m) => m.name));
  const bodies = new Map(macros.filter((m) => m.body).map((m) => [m.name, m.body!]));
  const callbacks = collectCallbacks(doc).filter((c) => !skip.has(c.name));
  if (!callbacks.length) {
    return `' 연결된 매크로가 없습니다.\r\n' 컨트롤 속성에서 매크로를 고르면 여기에 코드가 만들어집니다.\r\n`;
  }
  const first = new Map<string, CallbackKind>();
  const owners = new Map<string, CallbackRef[]>();
  const conflicts: string[] = [];
  for (const c of callbacks) {
    if (!first.has(c.name)) first.set(c.name, c.kind);
    else if (first.get(c.name) !== c.kind) conflicts.push(c.name);
    const list = owners.get(c.name) ?? [];
    list.push(c);
    owners.set(c.name, list);
  }
  const lines = ["Option Explicit", ""];
  if (doc.settings?.onLoad) {
    lines.push("Private ribbonUI As IRibbonUI", "");
  }
  if (conflicts.length) {
    lines.push("' 경고: 같은 매크로가 서로 다른 콜백 종류에 쓰였습니다. 처음 쓰인 서명을 따릅니다.");
    lines.push("' " + [...new Set(conflicts)].join(", "));
    lines.push("");
  }
  for (const [name, kind] of first) {
    const refs = owners.get(name) ?? [];
    const who = refs.map((r) => r.label || r.controlId).filter(Boolean).join(", ");
    lines.push(`' ${who || name} 콜백`);
    lines.push(`Sub ${name}(${SIG[kind]})`);
    if (kind === "onload") {
      lines.push("    Set ribbonUI = ribbon");
    } else if (bodies.has(name)) {
      for (const row of bodies.get(name)!.split(/\r?\n/)) lines.push(row ? `    ${row}` : "");
    } else if (refs.length > 1 && refs.every((r) => r.controlId)) {
      lines.push("    Select Case control.ID");
      for (const r of refs) {
        lines.push(`        Case \"${(r.controlId ?? "").replace(/"/g, '""')}\"`);
        lines.push(`            MsgBox \"${name} / ${r.controlId}\"`);
      }
      lines.push("    End Select");
    } else {
      lines.push("    ' 여기에 실행할 코드를 작성하세요");
      lines.push(`    MsgBox \"${name.replace(/"/g, '""')}\"`);
    }
    lines.push("End Sub");
    lines.push("");
  }
  if (doc.settings?.onLoad) {
    lines.push("Sub RefreshRibbon()");
    lines.push("    If Not ribbonUI Is Nothing Then ribbonUI.Invalidate");
    lines.push("End Sub");
    lines.push("");
  }
  return lines.join("\r\n");
}

export { SIG };
