import type { ControlType } from "@/model/types";

export const CONTROL_DEFS: { type: ControlType; mark: string; name: string }[] = [
  { type: "button", mark: "B", name: "버튼" },
  { type: "toggleButton", mark: "T", name: "토글버튼" },
  { type: "checkBox", mark: "✓", name: "체크박스" },
  { type: "editBox", mark: "E", name: "입력상자" },
  { type: "comboBox", mark: "C", name: "콤보박스" },
  { type: "dropDown", mark: "▾", name: "드롭다운" },
  { type: "menu", mark: "M", name: "메뉴" },
  { type: "splitButton", mark: "S", name: "분할버튼" },
  { type: "labelControl", mark: "L", name: "레이블" },
  { type: "separator", mark: "|", name: "구분선" },
];

export const PALETTE_ITEMS: { type: ControlType; mark: string; name: string }[] = [
  { type: "button", mark: "B", name: "버튼" },
  { type: "dropDown", mark: "▾", name: "드롭다운" },
  { type: "comboBox", mark: "C", name: "콤보박스" },
  { type: "toggleButton", mark: "T", name: "토글버튼" },
  { type: "checkBox", mark: "✓", name: "체크박스" },
  { type: "editBox", mark: "E", name: "입력상자" },
];

export const CONTROL_NAME: Record<ControlType, string> = {
  ...(Object.fromEntries(CONTROL_DEFS.map((d) => [d.type, d.name])) as Record<ControlType, string>),
  unknown: "알 수 없는 요소",
};

