# Savings Module Architecture

## Overview

Savings 모듈은 3가지 다른 저축 계좌 타입을 지원하며, 각각 고유한 인터페이스를 가집니다.

## Account Types

### 1. 입출금 계좌 (Checking Account)

자유롭게 입출금이 가능한 계좌로, 잔액 추적이 주 목적입니다.

**특징:**

- 이율 없음 (또는 매우 낮은 요구불 이자로 무시)
- 자유로운 입출금
- 잔액 변동 추적

**인터페이스:**

```typescript
interface CheckingAccount {
  id: number;
  accountName: string;
  accountType: "입출금"; // 리터럴 타입
  accountOwner: string;
  currency: string;
  balance: number; // 만원 단위
  records: CheckingAccountRecord[];
  note: string;
  color: string;
}

interface CheckingAccountRecord {
  date: string; // YYYY-MM-DD
  balance: number; // 만원 단위
}
```

### 2. 예적금 계좌 (Deposit Account) - TBD

고정 이율의 정기저축/적금 계좌 (추후 구현 예정)

**예상 특징:**

- 고정 이율
- 만기일
- 월 납입액 (적금인 경우)
- 세금 우대 여부

### 3. 주택청약 계좌 (Housing Savings Account) - TBD

주택청약종합저축 전용 계좌 (추후 구현 예정)

**예상 특징:**

- 고정 이율
- 월 납입액
- 청약 점수 계산
- 납입 인정 금액 상한

## Type System Design

### Current Implementation (Phase 1)

```typescript
// 입출금 전용 타입
type CheckingAccount = { ... }
type CheckingAccountRecord = { ... }

// Legacy (하위 호환성)
type SavingsItem = { ... } // @deprecated
type SavingsRecord = { ... } // @deprecated
```

### Future Implementation (Phase 2)

```typescript
// Union type으로 통합 예정
type SavingsAccount = CheckingAccount | DepositAccount | HousingAccount;

// Discriminated union으로 타입 가드
function isCheckingAccount(account: SavingsAccount): account is CheckingAccount {
  return account.accountType === "입출금";
}
```

## Migration Plan

1. **Phase 1 (현재)**: 입출금 계좌 인터페이스 정의
2. **Phase 2**: 예적금 인터페이스 정의 및 구현
3. **Phase 3**: 주택청약 인터페이스 정의 및 구현
4. **Phase 4**: Union type으로 통합, Legacy types 제거
5. **Phase 5**: Store 및 컴포넌트 타입 전환

## Design Principles

- **타입 안정성**: 각 계좌 타입별로 필요한 필드만 포함
- **확장성**: 새로운 계좌 타입 추가 용이
- **하위 호환성**: Legacy SavingsItem은 모든 타입 마이그레이션 후 제거
- **만원 단위**: 모든 금액 필드는 만원 단위로 통일
