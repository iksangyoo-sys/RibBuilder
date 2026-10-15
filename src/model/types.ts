import type { BuiltinTabId } from "@/constants/idMso";

export type ControlType =
  | "button"
  | "toggleButton"
  | "checkBox"
  | "editBox"
  | "comboBox"
  | "dropDown"
  | "menu"
  | "splitButton"
  | "labelControl"
  | "separator"
  | "unknown";

export type SizeKind = "large" | "normal";

export interface ListItem {
  uid: string;
  id: string;
  label: string;
}

export interface ControlBase {
  uid: string;
  type: ControlType;
  id: string;
  label: string;
  screentip: string;
  supertip: string;
  keytip: string;
  size: SizeKind;
  visible: boolean;
  enabled: boolean;
  showLabel: boolean;
  showImage: boolean;
  imageMso: string;
  imageId: string;
}

export interface ButtonControl extends ControlBase {
  type: "button";
  onAction: string;
}

export interface ToggleButtonControl extends ControlBase {
  type: "toggleButton";
  onAction: string;
  getPressed: string;
}

export interface CheckBoxControl extends ControlBase {
  type: "checkBox";
  onAction: string;
  getPressed: string;
}

export interface EditBoxControl extends ControlBase {
  type: "editBox";
  sizeString: string;
  maxLength: string;
  onChange: string;
  getText: string;
}

export interface ComboBoxControl extends ControlBase {
  type: "comboBox";
  items: ListItem[];
  sizeString: string;
  maxLength: string;
  onChange: string;
  getText: string;
}

export interface DropDownControl extends ControlBase {
  type: "dropDown";
  items: ListItem[];
  onAction: string;
  getSelectedItemID: string;
}

export interface MenuControl extends ControlBase {
  type: "menu";
  items: ButtonControl[];
}

export interface SplitButtonControl extends ControlBase {
  type: "splitButton";
  button: ButtonControl;
  menuId: string;
  items: ButtonControl[];
}

export interface LabelControl extends ControlBase {
  type: "labelControl";
}

export interface SeparatorControl extends ControlBase {
  type: "separator";
}

export interface UnknownControl extends ControlBase {
  type: "unknown";
  rawXml: string;
}

export type Control =
  | ButtonControl
  | ToggleButtonControl
  | CheckBoxControl
  | EditBoxControl
  | ComboBoxControl
  | DropDownControl
  | MenuControl
  | SplitButtonControl
  | LabelControl
  | SeparatorControl
  | UnknownControl;

export interface CustomGroup {
  kind: "custom";
  uid: string;
  id: string;
  label: string;
  controls: Control[];
  /** 기본 탭 안에서 이 그룹을 둘 자리 (기본 그룹 idMso 앞/뒤). 비우면 탭 끝. */
  insertBeforeMso?: string;
  insertAfterMso?: string;
}

export interface BuiltinGroup {
  kind: "builtin";
  uid: string;
  idMso: string;
  displayName: string;
}

export type Group = CustomGroup | BuiltinGroup;

export interface CustomTab {
  kind: "custom";
  uid: string;
  id: string;
  label: string;
  keytip: string;
  visible: boolean;
  insertAfterMso: string;
  insertBeforeMso: string;
  groups: Group[];
}

export interface BuiltinTab {
  kind: "builtin";
  uid: string;
  idMso: BuiltinTabId | string;
  label: string;
  visible: boolean;
  groups: Group[];
}

export type Tab = CustomTab | BuiltinTab;

export interface RibbonSettings {
  startFromScratch: boolean;
  onLoad: string;
}

export const EMPTY_SETTINGS: RibbonSettings = { startFromScratch: false, onLoad: "" };

export interface RibbonDoc {
  settings?: RibbonSettings;
  tabs: Tab[];
}

export interface RibbonImage {
  id: string;
  name: string;
  ext: string;
  dataUrl: string;
}

export type MacroSource = "file" | "builder" | "manual";

export interface MacroDef {
  name: string;
  source: MacroSource;
  callbackKind?: CallbackKind;
  body?: string;
  /** 매크로 관리에서 직접 등록한 매크로. 리본에 연결되지 않아도 목록에 남긴다. */
  pinned?: boolean;
  /** 파일 VBA에서 읽은 매개변수 (괄호 안 그대로). 형식이 맞지 않는 콜백에 고르지 못하게 하는 데 쓴다. */
  params?: string;
}

export type OriginKind = "xlsx" | "xlsm" | "xlsb" | "xlam" | "blank";

export interface Issue {
  level: "error" | "warn";
  uid: string;
  message: string;
}

export type Selection =
  | { kind: "none" }
  | { kind: "tab"; uid: string }
  | { kind: "group"; uid: string }
  | { kind: "control"; uid: string };

export type CallbackKind = "button" | "pressed" | "text" | "dropdown" | "getval" | "selitem" | "onload";
