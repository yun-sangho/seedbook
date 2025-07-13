/**
 * 계좌 유형 열거형
 */
export enum AccountType {
  GENERAL = "일반 투자 계좌",
  FOREIGN = "해외 투자 계좌",
  ISA = "ISA 계좌",
  IRP = "IRP 계좌",
  PENSION = "연금저축 계좌",
}

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
 * 계좌 유형 목록
 */
export const ACCOUNT_TYPES = Object.values(AccountType);

/**
 * 통화 옵션 목록
 */
export const CURRENCY_OPTIONS = Object.values(CurrencyType);

/**
 * 기본 계좌 소유자 목록
 */
export const DEFAULT_OWNERS = Object.values(DefaultOwnerType);
