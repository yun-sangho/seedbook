/**
 * 실물자산 유형 상수
 */
export enum RealAssetType {
  REAL_ESTATE = "부동산",
}

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
