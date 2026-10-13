/** Microsoft 공식 Office Fluent UI 컨트롤 식별자 (excelcontrols.xlsx, Microsoft 365 Current Channel). */
export const IDMSO_SOURCE =
  "OfficeDev/office-fluent-ui-command-identifiers · Microsoft 365 Current Channel excelcontrols.xlsx";

export const BUILTIN_TABS = [
  { idMso: "TabHome", label: "홈" },
  { idMso: "TabInsert", label: "삽입" },
  { idMso: "TabDrawInk", label: "그리기" },
  { idMso: "TabPageLayoutExcel", label: "페이지 레이아웃" },
  { idMso: "TabFormulas", label: "수식" },
  { idMso: "TabData", label: "데이터" },
  { idMso: "TabReview", label: "검토" },
  { idMso: "TabView", label: "보기" },
  { idMso: "TabDeveloper", label: "개발 도구" },
] as const;

export type BuiltinTabId = (typeof BUILTIN_TABS)[number]["idMso"];

export const BUILTIN_GROUPS = [
  { idMso: "GroupCode", displayName: "코드", hint: "Visual Basic, 매크로" },
  { idMso: "GroupControls", displayName: "컨트롤", hint: "삽입, 디자인 모드" },
  { idMso: "GroupXml", displayName: "XML", hint: "원본, 스키마" },
] as const;

export type BuiltinGroupId = (typeof BUILTIN_GROUPS)[number]["idMso"];

export const BUILTIN_GROUP_BY_ID = Object.fromEntries(
  BUILTIN_GROUPS.map((g) => [g.idMso, g]),
) as Record<BuiltinGroupId, (typeof BUILTIN_GROUPS)[number]>;

export const BUILTIN_TAB_BY_ID = Object.fromEntries([
  ...BUILTIN_TABS.map((t) => [t.idMso, t] as const),
  ["TabDraw", BUILTIN_TABS.find((t) => t.idMso === "TabDrawInk")!],
]) as Record<string, (typeof BUILTIN_TABS)[number]>;

export const KNOWN_IDMSO = new Set<string>([
  ...BUILTIN_TABS.map((t) => t.idMso),
  ...BUILTIN_GROUPS.map((g) => g.idMso),
]);
