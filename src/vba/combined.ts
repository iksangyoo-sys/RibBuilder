import { freeModuleName } from "@/ovba/append";
import type { VbaModule } from "@/ovba/extract";

export interface CombinedVba {
  text: string;
  /** 새로 더해질 코드가 시작하는 줄 번호 (0부터). 없으면 -1. */
  addedFrom: number;
}

/**
 * 기존 VBA가 있는 파일을 저장한 뒤의 VBA를 한 덩어리로 보여 준다.
 * 기존 모듈은 그대로, 그 아래에 저장할 때 새 모듈로 더해질 코드(appendModule과 같은 이름 규칙)를 붙인다.
 *
 * @param existing 파일에서 읽은 모듈. null이면 읽지 못한 경우 (암호 등).
 * @param added generateVba(…, { appendOnly: true })의 결과. 빈 문자열이면 더할 것이 없다.
 * @param willEmbed 저장할 때 VBA를 파일에 넣는지 (VBA 포함 + 연결된 콜백 있음).
 */
export function combinedVba(existing: VbaModule[] | null, added: string, willEmbed: boolean): CombinedVba {
  const parts: string[] = [];
  if (existing === null) {
    parts.push("' 이 파일의 기존 VBA 코드를 읽지 못했습니다. (암호로 잠긴 프로젝트이거나 형식이 다를 수 있습니다)");
  } else {
    for (const m of existing) parts.push(`' ===== ${m.name} =====\r\n${m.code}`);
  }
  let text = parts.join("\r\n\r\n");
  if (!added.trim()) return { text, addedFrom: -1 };
  const name = freeModuleName(new Set((existing ?? []).map((m) => m.name.toLowerCase())), "RibbonCallbacks");
  const header = willEmbed
    ? `' ===== ${name} (저장하면 새로 추가됨) =====`
    : "' ===== 새 매크로 ('VBA 포함'이 꺼져 있어 저장해도 추가되지 않음 · 직접 붙여 넣으세요) =====";
  if (text) text += "\r\n\r\n";
  const addedFrom = text ? text.split("\r\n").length - 1 : 0;
  return { text: `${text}${header}\r\n${added.replace(/\r?\n/g, "\r\n").replace(/(?:\r\n)+$/, "")}`, addedFrom };
}
