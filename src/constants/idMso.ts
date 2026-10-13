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

/**
 * 기본 탭마다 화면에 보이는 그룹 (왼쪽부터). 사용자 그룹을 그 사이에 넣을 때 insertBeforeMso 기준이 된다.
 * idMso는 위 IDMSO_SOURCE(Current Channel excelcontrols.xlsx)의 group 항목에서 골랐다.
 */
export const BUILTIN_TAB_GROUPS: Record<string, { idMso: string; label: string }[]> = {
  TabHome: [
    { idMso: "GroupClipboard", label: "클립보드" },
    { idMso: "GroupFont", label: "글꼴" },
    { idMso: "GroupAlignmentExcel", label: "맞춤" },
    { idMso: "GroupNumber", label: "숫자" },
    { idMso: "GroupStyles", label: "스타일" },
    { idMso: "GroupCells", label: "셀" },
    { idMso: "GroupEditingExcel", label: "편집" },
  ],
  TabInsert: [
    { idMso: "GroupInsertTablesExcel", label: "표" },
    { idMso: "GroupInsertIllustrations", label: "일러스트레이션" },
    { idMso: "GroupInsertChartsExcel", label: "차트" },
    { idMso: "GroupInsertLinks", label: "링크" },
    { idMso: "GroupInsertText", label: "텍스트" },
    { idMso: "GroupInsertSymbols", label: "기호" },
  ],
  TabDrawInk: [{ idMso: "GroupDrawingTools", label: "그리기 도구" }],
  TabPageLayoutExcel: [
    { idMso: "GroupThemesExcel", label: "테마" },
    { idMso: "GroupPageSetup", label: "페이지 설정" },
    { idMso: "GroupPageLayoutScaleToFit", label: "크기 조정" },
    { idMso: "GroupPageLayoutSheetOptions", label: "시트 옵션" },
    { idMso: "GroupArrange", label: "정렬" },
  ],
  TabFormulas: [
    { idMso: "GroupFunctionLibrary", label: "함수 라이브러리" },
    { idMso: "GroupNamedCells", label: "정의된 이름" },
    { idMso: "GroupFormulaAuditing", label: "수식 분석" },
    { idMso: "GroupCalculation", label: "계산" },
  ],
  TabData: [
    { idMso: "GroupPowerQueryGetTransformData", label: "데이터 가져오기" },
    { idMso: "GroupDataQueriesAndConnections", label: "쿼리 및 연결" },
    { idMso: "GroupSortFilter", label: "정렬 및 필터" },
    { idMso: "GroupDataTools", label: "데이터 도구" },
    { idMso: "GroupOutline", label: "개요" },
  ],
  TabReview: [
    { idMso: "GroupProofing", label: "언어 교정" },
    { idMso: "GroupComments", label: "메모" },
    { idMso: "GroupChangesExcel", label: "변경 내용" },
  ],
  TabView: [
    { idMso: "GroupWorkbookViews", label: "통합 문서 보기" },
    { idMso: "GroupViewShowHide", label: "표시" },
    { idMso: "GroupZoom", label: "확대/축소" },
    { idMso: "GroupWindow", label: "창" },
    { idMso: "GroupMacros", label: "매크로" },
  ],
  TabDeveloper: [
    { idMso: "GroupCode", label: "코드" },
    { idMso: "GroupControls", label: "컨트롤" },
    { idMso: "GroupXml", label: "XML" },
  ],
};

export function builtinGroupsOf(tabIdMso: string): { idMso: string; label: string }[] {
  return BUILTIN_TAB_GROUPS[tabIdMso === "TabDraw" ? "TabDrawInk" : tabIdMso] ?? [];
}

export const KNOWN_IDMSO = new Set<string>([
  ...BUILTIN_TABS.map((t) => t.idMso),
  ...BUILTIN_GROUPS.map((g) => g.idMso),
]);
