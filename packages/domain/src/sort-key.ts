import { generateNKeysBetween } from "fractional-indexing";

/**
 * 목록 순서 `sortKey` (분수 인덱스, 설계 §2.2). 키는 바이트 순(`<`)으로 비교한다 — 로캘 비교를 쓰지
 * 않는다. `last` 뒤에 붙일 키 `count` 개를 순서대로 만든다 (`last` 가 null 이면 목록의 처음부터).
 */
export function sortKeysAfter(last: string | null, count: number): string[] {
  return generateNKeysBetween(last, null, count);
}
