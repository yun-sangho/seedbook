import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

/**
 * 목록 순서 `sortKey` (분수 인덱스, 설계 §2.2). 키는 바이트 순(`<`)으로 비교한다 — 로캘 비교를 쓰지
 * 않는다. `last` 뒤에 붙일 키 `count` 개를 순서대로 만든다 (`last` 가 null 이면 목록의 처음부터).
 */
export function sortKeysAfter(last: string | null, count: number): string[] {
  return generateNKeysBetween(last, null, count);
}

/** 받은 키의 최대 길이. 분수 인덱스는 끼워 넣을 때마다 한 글자 남짓 길어진다. */
export const MAX_SORT_KEY_LENGTH = 256;

/** 분수 인덱스 키로 쓸 수 있는 값인지 (밖에서 받은 키 — 잘못된 키는 그 뒤 키를 만들 때 실패한다). */
export function isValidSortKey(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_SORT_KEY_LENGTH) {
    return false;
  }
  try {
    generateKeyBetween(value, null);
    return true;
  } catch {
    return false;
  }
}
