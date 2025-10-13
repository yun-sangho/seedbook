/**
 * 대출 유형 상수
 */
export const LOAN_TYPES = [
  "주택담보대출",
  "신용대출",
  "전세자금대출",
  "카드대출",
  "학자금대출",
  "기타",
] as const;

/**
 * 대출 소유자 타입
 */
export enum DefaultOwnerType {
  SELF = "본인",
  SPOUSE = "배우자",
}

/**
 * 기본 소유자 목록
 */
export const DEFAULT_OWNERS = [DefaultOwnerType.SELF, DefaultOwnerType.SPOUSE] as const;
