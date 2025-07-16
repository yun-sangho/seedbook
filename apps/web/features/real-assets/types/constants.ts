/**
 * 실물자산 유형 상수
 */
export const REAL_ASSET_TYPES = [
  "부동산",
  "자동차",
  "귀금속",
  "예술품",
  "가구/가전",
  "기타",
] as const;

/**
 * 실물자산 소유자 타입
 */
export enum DefaultOwnerType {
  SELF = "본인",
  SPOUSE = "배우자",
  JOINT = "공동소유",
}

/**
 * 기본 소유자 목록
 */
export const DEFAULT_OWNERS = [
  DefaultOwnerType.SELF,
  DefaultOwnerType.SPOUSE,
  DefaultOwnerType.JOINT,
] as const;
