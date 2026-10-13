import { XMLParser } from "fast-xml-parser";
import { BUILTIN_GROUP_BY_ID, BUILTIN_TAB_BY_ID, type BuiltinGroupId } from "@/constants/idMso";
import { IdIssuer, PREFIX } from "@/model/ids";
import type { ButtonControl, Control, CustomGroup, Group, ListItem, RibbonDoc, Tab } from "@/model/types";

type Ordered = Record<string, unknown>[];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  allowBooleanAttributes: true,
  parseAttributeValue: false,
  preserveOrder: true,
});

function attrsFrom(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    out[k.replace(/^@_/, "")] = String(v ?? "");
  }
  return out;
}

function childrenOf(nodes: Ordered): { tag: string; kids: Ordered; attrs: Record<string, string> }[] {
  return nodes.flatMap((n) => {
    const attrs = attrsFrom(n[":@"]);
    return Object.entries(n)
      .filter(([tag]) => tag !== ":@" && tag !== "#text" && tag !== "#comment")
      .map(([tag, kids]) => ({ tag, kids: (kids as Ordered) ?? [], attrs }));
  });
}

function a(attrs: Record<string, string>, name: string): string {
  return attrs[name] ?? "";
}

function bool(attrs: Record<string, string>, name: string, fallback: boolean): boolean {
  const v = a(attrs, name);
  if (!v) return fallback;
  return v === "true" || v === "1";
}

function sizeOf(attrs: Record<string, string>, fallback: "large" | "normal"): "large" | "normal" {
  if (attrs.size === "normal") return "normal";
  if (attrs.size === "large") return "large";
  return fallback;
}

export interface ParseResult {
  doc: RibbonDoc;
  notes: string[];
}

function parseButton(attrs: Record<string, string>, issuer: IdIssuer, fallbackSize: "large" | "normal"): ButtonControl {
  return {
    uid: issuer.uid(),
    type: "button",
    id: a(attrs, "id") || issuer.next(PREFIX.button),
    label: a(attrs, "label"),
    screentip: a(attrs, "screentip"),
    supertip: a(attrs, "supertip"),
    keytip: a(attrs, "keytip"),
    size: sizeOf(attrs, fallbackSize),
    visible: bool(attrs, "visible", true),
    enabled: bool(attrs, "enabled", true),
    showLabel: bool(attrs, "showLabel", true),
    showImage: bool(attrs, "showImage", true),
    imageMso: a(attrs, "imageMso"),
    imageId: a(attrs, "image"),
    onAction: a(attrs, "onAction"),
  };
}

function parseItems(kids: Ordered, issuer: IdIssuer): ListItem[] {
  return childrenOf(kids)
    .filter((c) => c.tag === "item")
    .map((c) => ({ uid: issuer.uid(), id: a(c.attrs, "id") || issuer.next(PREFIX.item), label: a(c.attrs, "label") }));
}

function commonFrom(attrs: Record<string, string>, issuer: IdIssuer, type: string, defaultSize: "large" | "normal") {
  return {
    uid: issuer.uid(),
    id: a(attrs, "id") || issuer.next(PREFIX[type] ?? "ctl"),
    label: a(attrs, "label"),
    screentip: a(attrs, "screentip"),
    supertip: a(attrs, "supertip"),
    keytip: a(attrs, "keytip"),
    size: sizeOf(attrs, defaultSize),
    visible: bool(attrs, "visible", true),
    enabled: bool(attrs, "enabled", true),
    showLabel: bool(attrs, "showLabel", true),
    showImage: bool(attrs, "showImage", true),
    imageMso: a(attrs, "imageMso"),
    imageId: a(attrs, "image"),
  };
}

function parseControl(tag: string, kids: Ordered, attrs: Record<string, string>, issuer: IdIssuer, _notes: string[]): Control | null {
  switch (tag) {
    case "button":
      return { ...commonFrom(attrs, issuer, tag, "large"), type: "button", onAction: a(attrs, "onAction") };
    case "toggleButton":
      return { ...commonFrom(attrs, issuer, tag, "large"), type: "toggleButton", onAction: a(attrs, "onAction"), getPressed: a(attrs, "getPressed") };
    case "checkBox":
      return { ...commonFrom(attrs, issuer, tag, "normal"), type: "checkBox", onAction: a(attrs, "onAction"), getPressed: a(attrs, "getPressed") };
    case "editBox":
      return { ...commonFrom(attrs, issuer, tag, "normal"), type: "editBox", sizeString: a(attrs, "sizeString") || "WWWWWWWWWWWW", maxLength: a(attrs, "maxLength"), onChange: a(attrs, "onChange"), getText: a(attrs, "getText") };
    case "comboBox":
      return { ...commonFrom(attrs, issuer, tag, "normal"), type: "comboBox", items: parseItems(kids, issuer), sizeString: a(attrs, "sizeString"), maxLength: a(attrs, "maxLength"), onChange: a(attrs, "onChange"), getText: a(attrs, "getText") };
    case "dropDown":
      return { ...commonFrom(attrs, issuer, tag, "normal"), type: "dropDown", items: parseItems(kids, issuer), onAction: a(attrs, "onAction"), getSelectedItemID: a(attrs, "getSelectedItemID") };
    case "menu":
      return {
        ...commonFrom(attrs, issuer, tag, "large"),
        type: "menu",
        items: childrenOf(kids).filter((c) => c.tag === "button").map((c) => parseButton(c.attrs, issuer, "normal")),
      };
    case "splitButton": {
      const kidsList = childrenOf(kids);
      const button = kidsList.find((c) => c.tag === "button");
      const menu = kidsList.find((c) => c.tag === "menu");
      const menuAttrs = menu?.attrs ?? {};
      return {
        ...commonFrom(attrs, issuer, tag, "large"),
        type: "splitButton",
        label: "",
        button: button ? parseButton(button.attrs, issuer, "normal") : parseButton({ label: "주 버튼" }, issuer, "normal"),
        menuId: a(menuAttrs, "id") || issuer.next(PREFIX.menu),
        items: menu ? childrenOf(menu.kids).filter((c) => c.tag === "button").map((c) => parseButton(c.attrs, issuer, "normal")) : [],
      };
    }
    case "labelControl":
      return { ...commonFrom(attrs, issuer, tag, "normal"), type: "labelControl" };
    case "separator":
      return { ...commonFrom(attrs, issuer, tag, "normal"), type: "separator", label: "" };
    default:
      return {
        ...commonFrom(attrs, issuer, "unknown", "normal"),
        type: "unknown" as const,
        label: a(attrs, "label") || tag,
        rawXml: serializeNode(tag, kids, attrs),
      };
  }
}

function serializeNode(tag: string, kids: Ordered, attrs: Record<string, string>): string {
  const a = Object.entries(attrs)
    .filter(([k]) => k)
    .map(([k, v]) => ` ${k}="${String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")}"`)
    .join("");
  const inner = kids
    .flatMap((n) => {
      if (typeof n["#text"] === "string") return [String(n["#text"])];
      return Object.entries(n)
        .filter(([k]) => k !== ":@" && k !== "#text")
        .map(([childTag, childKids]) => serializeNode(childTag, (childKids as Ordered) ?? [], attrsFrom(n[":@"])));
    })
    .join("");
  return inner ? `<${tag}${a}>${inner}</${tag}>` : `<${tag}${a}/>`;
}

function parseGroup(kids: Ordered, attrs: Record<string, string>, issuer: IdIssuer, notes: string[]): Group {
  const idMso = a(attrs, "idMso");
  if (idMso && !a(attrs, "id")) {
    const known = BUILTIN_GROUP_BY_ID[idMso as BuiltinGroupId];
    return { kind: "builtin", uid: issuer.uid(), idMso, displayName: known?.displayName ?? idMso };
  }
  const group: CustomGroup = {
    kind: "custom",
    uid: issuer.uid(),
    id: a(attrs, "id") || issuer.next(PREFIX.group),
    label: a(attrs, "label"),
    controls: [],
  };
  for (const child of childrenOf(kids)) {
    const parsed = parseControl(child.tag, child.kids, child.attrs, issuer, notes);
    if (parsed) group.controls.push(parsed);
  }
  return group;
}

function parseTab(kids: Ordered, attrs: Record<string, string>, issuer: IdIssuer, notes: string[]): Tab {
  const groups = childrenOf(kids)
    .filter((c) => c.tag === "group")
    .map((c) => parseGroup(c.kids, c.attrs, issuer, notes));
  const idMso = a(attrs, "idMso");
  if (idMso && !a(attrs, "id")) {
    return {
      kind: "builtin",
      uid: issuer.uid(),
      idMso: idMso === "TabDraw" ? "TabDrawInk" : idMso,
      label: BUILTIN_TAB_BY_ID[idMso]?.label ?? idMso,
      visible: bool(attrs, "visible", true),
      groups,
    };
  }
  return {
    kind: "custom",
    uid: issuer.uid(),
    id: a(attrs, "id") || issuer.next(PREFIX.tab),
    label: a(attrs, "label"),
    keytip: a(attrs, "keytip"),
    visible: bool(attrs, "visible", true),
    insertAfterMso: a(attrs, "insertAfterMso"),
    insertBeforeMso: a(attrs, "insertBeforeMso"),
    groups,
  };
}

export function parseCustomUi(xml: string): ParseResult {
  const notes: string[] = [];
  let tree: Ordered;
  try {
    tree = parser.parse(xml) as Ordered;
  } catch (err) {
    throw new Error(`XML을 해석하지 못했습니다. ${err instanceof Error ? err.message : ""}`);
  }
  const root = tree.find((n) => n.customUI || n.customui);
  if (!root) throw new Error("customUI 루트 요소가 없습니다.");
  const rootKids = (root.customUI ?? root.customui) as Ordered;
  const ribbon = childrenOf(rootKids).find((c) => c.tag === "ribbon");
  const tabsNode = ribbon ? childrenOf(ribbon.kids).find((c) => c.tag === "tabs") : undefined;
  const issuer = new IdIssuer();
  const tabs = tabsNode
    ? childrenOf(tabsNode.kids).filter((c) => c.tag === "tab").map((c) => parseTab(c.kids, c.attrs, issuer, notes))
    : [];
  for (const extra of childrenOf(rootKids)) {
    if (extra.tag !== "ribbon" && extra.tag !== "#text") {
      notes.push(`${extra.tag} 요소는 편집 대상이 아니어서 건너뛰었습니다.`);
    }
  }
  if (ribbon) {
    for (const extra of childrenOf(ribbon.kids)) {
      if (extra.tag !== "tabs") notes.push(`${extra.tag} 은(는) 건너뛰었습니다.`);
    }
  }
  const ribbonAttrs = ribbon?.attrs ?? {};
  const rootObj = root as Record<string, unknown>;
  const rootAttrs = attrsFrom(rootObj[":@"]);
  const settings = {
    startFromScratch: bool(ribbonAttrs, "startFromScratch", false),
    onLoad: a(rootAttrs, "onLoad"),
  };
  return { doc: { settings, tabs }, notes };
}

export function parseErrorLocation(xml: string, message: string): string {
  const match = message.match(/line[:\s]+(\d+)/i);
  if (match) return `${match[1]}번째 줄: ${message}`;
  if (!xml.trim().startsWith("<")) return `XML이 '<'로 시작하지 않습니다. ${message}`;
  return message;
}
