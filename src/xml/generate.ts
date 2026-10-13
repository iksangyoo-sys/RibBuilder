import { attr } from "./escape";
import { EMPTY_SETTINGS, type ButtonControl, type Control, type Group, type RibbonDoc, type RibbonSettings, type Tab } from "@/model/types";

export const NS_2009 = "http://schemas.microsoft.com/office/2009/07/customui";
export const NS_2006 = "http://schemas.microsoft.com/office/2006/01/customui";

export interface GenerateOptions {
  ns?: "2009" | "2006";
  pretty?: boolean;
  comments?: boolean;
}

function settingsOf(doc: RibbonDoc): RibbonSettings {
  return doc.settings ?? EMPTY_SETTINGS;
}

function boolAttr(name: string, value: boolean, fallback: boolean): string {
  if (value === fallback) return "";
  return attr(name, value);
}

function iconAttrs(c: { imageId: string; imageMso: string }): string {
  if (c.imageId) return attr("image", c.imageId);
  return attr("imageMso", c.imageMso);
}

function commonAttrs(c: Control, withSize: boolean): string {
  let s = attr("id", c.id);
  if (c.type !== "separator" && c.type !== "splitButton" && c.type !== "unknown") s += attr("label", c.label);
  if (withSize && c.type !== "separator" && c.type !== "checkBox" && c.type !== "editBox" && c.type !== "comboBox" && c.type !== "dropDown" && c.type !== "labelControl" && c.type !== "unknown") {
    s += attr("size", c.size);
  }
  s += attr("screentip", c.screentip);
  s += attr("supertip", c.supertip);
  s += attr("keytip", c.keytip);
  s += boolAttr("visible", c.visible, true);
  s += boolAttr("enabled", c.enabled, true);
  if (c.type !== "checkBox" && c.type !== "separator" && c.type !== "unknown") {
    s += boolAttr("showLabel", c.showLabel, true);
    s += boolAttr("showImage", c.showImage, true);
  }
  if (c.type !== "checkBox" && c.type !== "labelControl" && c.type !== "separator" && c.type !== "splitButton" && c.type !== "unknown") {
    s += iconAttrs(c);
  }
  return s;
}

function buttonXml(b: ButtonControl, withSize: boolean): string {
  return `<button${commonAttrs(b, withSize)}${attr("onAction", b.onAction)}/>`;
}

function itemsXml(items: { id: string; label: string }[]): string {
  return items.map((it) => `<item${attr("id", it.id)}${attr("label", it.label)}/>`).join("");
}

export function controlXml(c: Control): string {
  switch (c.type) {
    case "button":
      return buttonXml(c, true);
    case "toggleButton":
      return `<toggleButton${commonAttrs(c, true)}${attr("onAction", c.onAction)}${attr("getPressed", c.getPressed)}/>`;
    case "checkBox":
      return `<checkBox${commonAttrs(c, false)}${attr("onAction", c.onAction)}${attr("getPressed", c.getPressed)}/>`;
    case "editBox":
      return `<editBox${commonAttrs(c, false)}${attr("sizeString", c.sizeString || "WWWWWWWWWWWW")}${attr("maxLength", c.maxLength)}${attr("onChange", c.onChange)}${attr("getText", c.getText)}/>`;
    case "comboBox":
      return `<comboBox${commonAttrs(c, false)}${attr("sizeString", c.sizeString)}${attr("maxLength", c.maxLength)}${attr("onChange", c.onChange)}${attr("getText", c.getText)}>${itemsXml(c.items)}</comboBox>`;
    case "dropDown":
      return `<dropDown${commonAttrs(c, false)}${attr("onAction", c.onAction)}>${itemsXml(c.items)}</dropDown>`;
    case "menu":
      return `<menu${commonAttrs(c, true)}>${c.items.map((b) => buttonXml(b, false)).join("")}</menu>`;
    case "splitButton":
      return `<splitButton${attr("id", c.id)}${attr("size", c.size)}${boolAttr("visible", c.visible, true)}${boolAttr("enabled", c.enabled, true)}>${buttonXml(c.button, false)}<menu${attr("id", c.menuId)}>${c.items.map((b) => buttonXml(b, false)).join("")}</menu></splitButton>`;
    case "labelControl":
      return `<labelControl${commonAttrs(c, false)}/>`;
    case "separator":
      return `<separator${attr("id", c.id)}${boolAttr("visible", c.visible, true)}/>`;
    case "unknown":
      return c.rawXml;
  }
}

export function groupXml(group: Group, comments = false): string {
  if (group.kind === "builtin") {
    const note = comments ? `<!-- ${group.displayName} -->` : "";
    return `${note}<group idMso="${group.idMso}"/>`;
  }
  const inner = group.controls.map(controlXml).join("");
  const note = comments ? `<!-- ${group.label} -->` : "";
  return `${note}<group${attr("id", group.id)}${attr("label", group.label)}>${inner}</group>`;
}

export function tabEmits(tab: Tab): boolean {
  if (tab.kind === "builtin") return tab.groups.length > 0 || tab.visible === false;
  return true;
}

export function tabXml(tab: Tab, comments = false): string {
  const inner = tab.groups.map((g) => groupXml(g, comments)).join("");
  if (tab.kind === "builtin") {
    return `<tab${attr("idMso", tab.idMso)}${boolAttr("visible", tab.visible, true)}>${inner}</tab>`;
  }
  return `<tab${attr("id", tab.id)}${attr("label", tab.label)}${attr("keytip", tab.keytip)}${boolAttr("visible", tab.visible, true)}${attr("insertAfterMso", tab.insertAfterMso)}${attr("insertBeforeMso", tab.insertBeforeMso)}>${inner}</tab>`;
}

export function generateCustomUi(doc: RibbonDoc, options: GenerateOptions = {}): string {
  const ns = options.ns === "2006" ? NS_2006 : NS_2009;
  const settings = settingsOf(doc);
  const tabs = doc.tabs.filter(tabEmits);
  const onLoad = attr("onLoad", settings.onLoad);
  const scratch = settings.startFromScratch ? attr("startFromScratch", true) : "";
  let body: string;
  if (!tabs.length) {
    body = `<customUI xmlns="${ns}"${onLoad}/>`;
  } else {
    body = `<customUI xmlns="${ns}"${onLoad}><ribbon${scratch}><tabs>${tabs.map((t) => tabXml(t, options.comments)).join("")}</tabs></ribbon></customUI>`;
  }
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${body}`;
  return options.pretty ? prettyXml(xml) : xml;
}

export function prettyXml(xml: string): string {
  const compact = xml.replace(/></g, ">\n<");
  const lines = compact.split("\n");
  let depth = 0;
  return lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return "";
      if (trimmed.startsWith("</")) depth = Math.max(0, depth - 1);
      const out = "  ".repeat(depth) + trimmed;
      if (trimmed.startsWith("<") && !trimmed.startsWith("</") && !trimmed.startsWith("<?") && !trimmed.startsWith("<!--") && !trimmed.endsWith("/>") && !trimmed.includes("</")) {
        depth += 1;
      }
      return out;
    })
    .join("\n");
}

export { NS_2009 as CUSTOM_UI_NS };
