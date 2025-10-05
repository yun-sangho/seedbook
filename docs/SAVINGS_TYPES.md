# Savings Module Type System

## Overview

Savings 모듈은 **3가지 카테고리**와 **4가지 계좌 타입**을 지원하며, 각각 고유한 인터페이스를 가집니다.

## Category & Account Type Structure

```
저축 계좌 (Savings Account)
├─ 입출금 (Checking)
│  └─ 입출금 (Checking Account)
├─ 예적금 (Deposit)
│  ├─ 예금 (Savings Deposit)
│  └─ 적금 (Installment Savings)
└─ 주택청약 (Housing)
   └─ 주택청약 (Housing Subscription)
```

## Account Types

### 1. 입출금 계좌 (Checking Account)

**카테고리**: 입출금  
**계좌 타입**: 입출금

자유롭게 입출금이 가능한 계좌로, 잔액 추적이 주 목적입니다.

**특징:**

- 이율 선택적 (요구불 이자가 있는 경우에만)
- 자유로운 입출금
- 잔액 변동 추적

**인터페이스:**

```typescript
interface CheckingAccount {
  id: number;
  accountName: string;
  category: SavingsCategory.CHECKING;
  accountType: CheckingAccountType.CHECKING;
  accountOwner: string;
  currency: string;
  interestRate?: number; // 선택적
  records: CheckingAccountRecord[];
  color: string;
}

interface CheckingAccountRecord {
  date: string; // YYYY-MM-DD
  balance: number; // 만원 단위
}
```

### 2. 정기예금 계좌 (Savings Deposit Account)

**카테고리**: 예적금  
**계좌 타입**: 예금

고정 이율의 정기예금 계좌

**특징:**

- 고정 이율 (필수)
- 만기일 (선택적)
- 일시납 형태

**인터페이스:**

```typescript
interface SavingsDepositAccount {
  id: number;
  accountName: string;
  category: SavingsCategory.DEPOSIT;
  accountType: DepositAccountType.SAVINGS_DEPOSIT;
  accountOwner: string;
  currency: string;
  interestRate: number; // 필수
  maturityDate?: string; // YYYY-MM-DD
  records: DepositAccountRecord[];
  color: string;
}

interface DepositAccountRecord {
  date: string;
  balance: number;
  interestRate?: number; // 이율 변동 시
}
```

### 3. 정기적금 계좌 (Installment Savings Account)

**카테고리**: 예적금  
**계좌 타입**: 적금

월 납입 형태의 정기적금 계좌

**특징:**

- 고정 이율 (필수)
- 월 납입액 (선택적)
- 만기일 (선택적)
- 정기 납입 형태

**인터페이스:**

```typescript
interface InstallmentSavingsAccount {
  id: number;
  accountName: string;
  category: SavingsCategory.DEPOSIT;
  accountType: DepositAccountType.INSTALLMENT_SAVINGS;
  accountOwner: string;
  currency: string;
  interestRate: number; // 필수
  monthlyDeposit?: number; // 만원 단위
  maturityDate?: string; // YYYY-MM-DD
  records: DepositAccountRecord[];
  color: string;
}
```

### 4. 주택청약 계좌 (Housing Subscription Account)

**카테고리**: 주택청약  
**계좌 타입**: 주택청약

주택청약종합저축 전용 계좌

**특징:**

- 고정 이율 (필수)
- 월 납입액 (선택적)
- 청약 점수 계산 가능
- 납입 인정 금액 상한 존재

**인터페이스:**

```typescript
interface HousingSubscriptionAccount {
  id: number;
  accountName: string;
  category: SavingsCategory.HOUSING;
  accountType: HousingAccountType.HOUSING_SUBSCRIPTION;
  accountOwner: string;
  currency: string;
  interestRate: number; // 필수
  monthlyDeposit?: number; // 만원 단위
  records: HousingAccountRecord[];
  color: string;
}

interface HousingAccountRecord {
  date: string;
  balance: number;
}
```

## Type System Design

### Enums

```typescript
// 카테고리
enum SavingsCategory {
  CHECKING = "입출금",
  DEPOSIT = "예적금",
  HOUSING = "주택청약",
}

// 입출금 타입
enum CheckingAccountType {
  CHECKING = "입출금",
}

// 예적금 타입
enum DepositAccountType {
  SAVINGS_DEPOSIT = "예금",
  INSTALLMENT_SAVINGS = "적금",
}

// 주택청약 타입
enum HousingAccountType {
  HOUSING_SUBSCRIPTION = "주택청약",
}
```

### Union Type & Type Guards

```typescript
// Union type
type SavingsAccount =
  | CheckingAccount
  | SavingsDepositAccount
  | InstallmentSavingsAccount
  | HousingSubscriptionAccount;

// Type guards
function isCheckingAccount(account: SavingsAccount): account is CheckingAccount {
  return account.category === SavingsCategory.CHECKING;
}

function isSavingsDepositAccount(account: SavingsAccount): account is SavingsDepositAccount {
  return (
    account.category === SavingsCategory.DEPOSIT &&
    account.accountType === DepositAccountType.SAVINGS_DEPOSIT
  );
}

function isInstallmentSavingsAccount(
  account: SavingsAccount
): account is InstallmentSavingsAccount {
  return (
    account.category === SavingsCategory.DEPOSIT &&
    account.accountType === DepositAccountType.INSTALLMENT_SAVINGS
  );
}

function isHousingSubscriptionAccount(
  account: SavingsAccount
): account is HousingSubscriptionAccount {
  return account.category === SavingsCategory.HOUSING;
}

function isDepositCategory(
  account: SavingsAccount
): account is SavingsDepositAccount | InstallmentSavingsAccount {
  return account.category === SavingsCategory.DEPOSIT;
}
```

## Usage Examples

### 타입별 처리

```typescript
function processAccount(account: SavingsAccount) {
  if (isCheckingAccount(account)) {
    // account는 CheckingAccount로 자동 타입 추론
    console.log(`입출금 계좌: ${account.accountName}`);
    if (account.interestRate) {
      console.log(`요구불 이자: ${account.interestRate}%`);
    }
  } else if (isSavingsDepositAccount(account)) {
    // account는 SavingsDepositAccount로 자동 타입 추론
    console.log(`정기예금: ${account.accountName}, 이율: ${account.interestRate}%`);
    if (account.maturityDate) {
      console.log(`만기일: ${account.maturityDate}`);
    }
  } else if (isInstallmentSavingsAccount(account)) {
    // account는 InstallmentSavingsAccount로 자동 타입 추론
    console.log(`정기적금: ${account.accountName}, 월납입: ${account.monthlyDeposit}만원`);
  } else if (isHousingSubscriptionAccount(account)) {
    // account는 HousingSubscriptionAccount로 자동 타입 추론
    console.log(`주택청약: ${account.accountName}`);
  }
}
```

### 카테고리별 필터링

```typescript
// 예적금 카테고리만 필터링
const depositAccounts = accounts.filter(isDepositCategory);

// 입출금 계좌만 필터링
const checkingAccounts = accounts.filter(isCheckingAccount);
```

## Design Principles

- **타입 안정성**: Discriminated Union으로 각 계좌 타입 구분
- **확장성**: 새로운 계좌 타입 추가 용이 (enum + interface)
- **카테고리 구분**: category와 accountType 2단계 구조
- **만원 단위**: 모든 금액 필드는 만원 단위로 통일
- **Type Guards**: 자동 타입 추론으로 안전한 타입 처리
