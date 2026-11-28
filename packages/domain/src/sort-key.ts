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

/**
 * 목록 순서대로 놓인 항목들의 지금 키(없으면 null)를 받아, 목록 순서와 같은 순서의 키를 돌려준다.
 * 이미 순서가 맞는 키는 가장 많이 남기고(최장 증가 부분열) 나머지만 이웃 사이에 새로 만든다 — 한
 * 항목을 옮기면 그 항목의 키만 바뀐다. 분수 인덱스가 아닌 키와 겹친 키는 새로 만든다.
 */
export function assignListSortKeys(current: ReadonlyArray<string | null>): string[] {
  const keep = longestIncreasing(current.map((key) => (isValidSortKey(key) ? key : null)));
  const result: string[] = [];
  let index = 0;
  while (index < current.length) {
    const kept = keep[index];
    if (kept !== null && kept !== undefined) {
      result.push(kept);
      index += 1;
      continue;
    }
    let end = index;
    while (end < current.length && (keep[end] ?? null) === null) end += 1;
    const lower = result.at(-1) ?? null;
    const upper = end < current.length ? (keep[end] ?? null) : null;
    result.push(...generateNKeysBetween(lower, upper, end - index));
    index = end;
  }
  return result;
}

/** 엄격히 증가하는 최장 부분열에 든 키만 남기고 나머지는 null. */
function longestIncreasing(keys: ReadonlyArray<string | null>): Array<string | null> {
  // tails[k] = 길이 k+1 인 증가 부분열의 마지막 위치 (그 키가 가장 작은 것).
  const tails: number[] = [];
  const previous = new Array<number>(keys.length).fill(-1);
  keys.forEach((key, i) => {
    if (key === null) return;
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if ((keys[tails[mid] as number] as string) < key) low = mid + 1;
      else high = mid;
    }
    if (low > 0) previous[i] = tails[low - 1] as number;
    tails[low] = i;
  });
  const result = new Array<string | null>(keys.length).fill(null);
  let at = tails.at(-1) ?? -1;
  while (at !== -1) {
    result[at] = keys[at] ?? null;
    at = previous[at] as number;
  }
  return result;
}
