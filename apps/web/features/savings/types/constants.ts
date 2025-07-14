// 저축 유형 상수
export const SAVINGS_TYPES = ["예금", "적금", "청약", "CMA", "기타"] as const;

// 저축 소유자 타입
export enum DefaultOwnerType {
  SELF = "본인",
  SPOUSE = "배우자",
}

// 기본 소유자 목록
export const DEFAULT_OWNERS = [DefaultOwnerType.SELF, DefaultOwnerType.SPOUSE] as const;
