/**
 * 통화 유형 열거형
 */
export enum CurrencyType {
  KRW = "원",
}

/**
 * 계좌 소유자 열거형 (기본 값)
 */
export enum DefaultOwnerType {
  SELF = "본인",
  SPOUSE = "배우자",
}

/**
 * 저축 계좌 유형 목록
 */

/**
 * 통화 옵션 목록
 */
export const CURRENCY_OPTIONS = Object.values(CurrencyType);

/**
 * 기본 계좌 소유자 목록
 */
export const DEFAULT_OWNERS = Object.values(DefaultOwnerType);
