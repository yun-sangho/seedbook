/**
 * store 항목을 저장·전송하기 전에 값을 정리하는 공용 규칙. 서버 검증(`server/<domain>/*-record.ts`)
 * 은 유한한 숫자만 받는데, 입력 도중의 값(`parseFloat("")` = NaN 등)이 store 에 들어갈 수 있다.
 * persist 는 NaN·Infinity 를 JSON `null` 로 직렬화하므로 `null` 도 같은 규칙으로 정리한다.
 */

/** 유한한 숫자가 아니면(NaN·Infinity·null·빠짐) `fallback`. */
export const finiteNumber = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/** 유한한 숫자가 아니면 `null` (값이 없을 수 있는 숫자). */
export const finiteNumberOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** 문자열이 아니면 빈 문자열. */
export const text = (value: unknown): string => (typeof value === "string" ? value : "");

/** 배열이 아니면 빈 배열. */
export const listOf = <T>(value: readonly T[] | null | undefined): T[] =>
  Array.isArray(value) ? (value as T[]) : [];
