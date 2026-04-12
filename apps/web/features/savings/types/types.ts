import {
  CheckingAccountType,
  DepositAccountType,
  HousingAccountType,
  SavingsCategory,
} from "./constants";

/**
 * 입출금 계좌 잔액 기록 인터페이스 (히스토리용)
 */
export interface CheckingAccountRecord {
  date: string; // 기준날짜 (YYYY-MM-DD 형식)
  balance: number; // 잔액 (원 단위)
}

/**
 * 입출금 계좌 인터페이스
 * - 카테고리: 입출금
 * - 계좌 타입: 입출금
 * - 자유롭게 입출금이 가능한 계좌
 * - 이율은 선택적 (요구불 이자가 있는 경우)
 */
export interface CheckingAccount {
  id: string;
  accountName: string; // 계좌명 (예: "KB국민은행 입출금")
  category: SavingsCategory.CHECKING; // 카테고리
  accountType: CheckingAccountType.CHECKING; // 계좌 타입
  accountOwner: string; // 계좌 소유자 (본인, 배우자 등)
  currency: string; // 통화 (KRW, USD 등)
  interestRate?: number; // 이율 (선택적, %)
  records: CheckingAccountRecord[]; // 잔액 변경 히스토리
  color: string; // 차트 표시 색상
}

/**
 * 저축 계좌 잔액 기록 인터페이스 (히스토리용)
 */
export interface DepositAccountRecord {
  date: string; // 기준날짜 (YYYY-MM-DD 형식)
  balance: number; // 잔액 (원 단위)
  interestRate?: number; // 이율 (%, 변동 시)
}

/**
 * 정기저축 계좌 인터페이스
 * - 카테고리: 예적금
 * - 계좌 타입: 저축
 */
export interface SavingsDepositAccount {
  id: string;
  accountName: string; // 계좌명
  category: SavingsCategory.DEPOSIT; // 카테고리
  accountType: DepositAccountType.SAVINGS_DEPOSIT; // 계좌 타입: 저축
  accountOwner: string; // 계좌 소유자
  currency: string; // 통화
  interestRate: number; // 이율 (%, 필수)
  maturityDate?: string; // 만기일 (YYYY-MM-DD)
  records: DepositAccountRecord[]; // 잔액 변경 히스토리
  color: string; // 차트 표시 색상
}

/**
 * 정기적금 계좌 인터페이스
 * - 카테고리: 예적금
 * - 계좌 타입: 적금
 */
export interface InstallmentSavingsAccount {
  id: string;
  accountName: string; // 계좌명
  category: SavingsCategory.DEPOSIT; // 카테고리
  accountType: DepositAccountType.INSTALLMENT_SAVINGS; // 계좌 타입: 적금
  accountOwner: string; // 계좌 소유자
  currency: string; // 통화
  interestRate: number; // 이율 (%, 필수)
  monthlyDeposit?: number; // 월 납입액 (만원)
  maturityDate?: string; // 만기일 (YYYY-MM-DD)
  records: DepositAccountRecord[]; // 잔액 변경 히스토리
  color: string; // 차트 표시 색상
}

/**
 * 주택청약 계좌 잔액 기록 인터페이스 (히스토리용)
 */
export interface HousingAccountRecord {
  date: string; // 기준날짜 (YYYY-MM-DD 형식)
  balance: number; // 잔액 (원 단위)
}

/**
 * 주택청약종합저축 계좌 인터페이스
 * - 카테고리: 주택청약
 * - 계좌 타입: 주택청약
 */
export interface HousingSubscriptionAccount {
  id: string;
  accountName: string; // 계좌명
  category: SavingsCategory.HOUSING; // 카테고리
  accountType: HousingAccountType.HOUSING_SUBSCRIPTION; // 계좌 타입: 주택청약
  accountOwner: string; // 계좌 소유자
  currency: string; // 통화
  interestRate: number; // 이율 (%, 필수)
  monthlyDeposit?: number; // 월 납입액 (만원)
  records: HousingAccountRecord[]; // 잔액 변경 히스토리
  color: string; // 차트 표시 색상
}

/**
 * 모든 저축 계좌 타입의 Union
 */
export type SavingsAccount =
  | CheckingAccount
  | SavingsDepositAccount
  | InstallmentSavingsAccount
  | HousingSubscriptionAccount;

// ============================================================================
// Type Guards (타입 가드 헬퍼 함수)
// ============================================================================

/**
 * 입출금 계좌인지 확인
 */
export function isCheckingAccount(account: SavingsAccount): account is CheckingAccount {
  return account.category === SavingsCategory.CHECKING;
}

/**
 * 정기저축 계좌인지 확인
 */
export function isSavingsDepositAccount(account: SavingsAccount): account is SavingsDepositAccount {
  return (
    account.category === SavingsCategory.DEPOSIT &&
    account.accountType === DepositAccountType.SAVINGS_DEPOSIT
  );
}

/**
 * 정기적금 계좌인지 확인
 */
export function isInstallmentSavingsAccount(
  account: SavingsAccount
): account is InstallmentSavingsAccount {
  return (
    account.category === SavingsCategory.DEPOSIT &&
    account.accountType === DepositAccountType.INSTALLMENT_SAVINGS
  );
}

/**
 * 주택청약 계좌인지 확인
 */
export function isHousingSubscriptionAccount(
  account: SavingsAccount
): account is HousingSubscriptionAccount {
  return account.category === SavingsCategory.HOUSING;
}

/**
 * 예적금 카테고리인지 확인 (저축 또는 적금)
 */
export function isDepositCategory(
  account: SavingsAccount
): account is SavingsDepositAccount | InstallmentSavingsAccount {
  return account.category === SavingsCategory.DEPOSIT;
}

// ============================================================================
// Working Types (현재 실제 사용 중인 타입)
// ============================================================================

/**
 * 저축 계좌 레코드 인터페이스 (히스토리용)
 * 입출금 계좌 레코드와 동일한 구조
 */
export interface SavingsRecord {
  date: string; // 기준날짜 (YYYY-MM-DD 형식)
  balance: number; // 잔액 (원 단위)
}

/**
 * 저축 계좌 아이템 인터페이스
 * 현재 구현에서 실제로 사용하는 범용 계좌 타입
 */
export interface SavingsItem {
  id: string;
  accountName: string; // 계좌명
  accountType: string; // 계좌 타입 (입출금, 저축, 적금, 주택청약 등)
  accountOwner: string; // 계좌 소유자 (본인, 배우자 등)
  currency: string; // 통화 (KRW, USD 등)
  balance: number; // 현재 잔액 (원 단위)
  interestRate?: number; // 이율 (선택적, %)
  records: SavingsRecord[]; // 잔액 변경 히스토리
  note: string; // 메모
  color: string; // 차트 표시 색상
}
