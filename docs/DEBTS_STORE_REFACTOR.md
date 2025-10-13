# Debts Store 리팩토링 완료

## 📋 변경 사항

### Store 메서드명 변경 (loans → debts)

#### `features/debts/stores/debts-store.ts`

**인터페이스 변경:**

```typescript
// Before
interface DebtsState {
  debts: DebtsItem[];
  expandedFormId: number;
  lastLoanId: number;
  addLoan: () => void;
  removeLoan: (id: number) => void;
  updateLoan: <K extends keyof DebtsItem>(id: number, key: K, value: DebtsItem[K]) => void;
  reorderLoans: (reorderedLoans: DebtsItem[]) => void;
}

// After
interface DebtsState {
  debts: DebtsItem[];
  expandedFormId: number;
  lastDebtId: number; // ✅ lastLoanId → lastDebtId
  addDebt: () => void; // ✅ addLoan → addDebt
  removeDebt: (id: number) => void; // ✅ removeLoan → removeDebt
  updateDebt: <K extends keyof DebtsItem>(id: number, key: K, value: DebtsItem[K]) => void; // ✅ updateLoan → updateDebt
  reorderDebts: (reorderedDebts: DebtsItem[]) => void; // ✅ reorderLoans → reorderDebts
}
```

**구현체 변경:**

- `lastLoanId` → `lastDebtId`
- `addLoan` → `addDebt`
- `removeLoan` → `removeDebt`
- `updateLoan` → `updateDebt`
- `reorderLoans` → `reorderDebts`

### 업데이트된 파일 목록

#### 1. 컴포넌트

- ✅ `app/assets/debt/_components/debt-manager.tsx`
  - `useDebtsStore((state) => state.updateLoan)` → `updateDebt`
  - `useDebtsStore((state) => state.removeLoan)` → `removeDebt`
  - `useDebtsStore((state) => state.reorderLoans)` → `reorderDebts`

- ✅ `app/assets/debt/_components/add-debt-modal.tsx`
  - `useDebtsStore((state) => state.addLoan)` → `addDebt`
  - `useDebtsStore((state) => state.updateLoan)` → `updateDebt`
  - `useDebtsStore((state) => state.lastLoanId)` → `lastDebtId`

#### 2. 테스트

- ✅ `features/assets/utils/auto-progress-tracker.test.ts`
  - `useDebtsStore.setState({ debts: [], lastLoanId: 0 })` → `lastDebtId: 0`
  - `useDebtsStore.getState().addLoan()` → `addDebt()`
  - `useDebtsStore.getState().updateLoan()` → `updateDebt()`
  - `useDebtsStore.getState().removeLoan()` → `removeDebt()`
  - **12개 테스트 모두 통과** ✅

#### 3. 관리 페이지

- ✅ `app/admin/page.tsx`
  - `useDebtsStore.setState({ debts: data.loans, lastLoanId: maxId + 1 })` → `{ debts: data.debts, lastDebtId: maxId + 1 }`

## 🎯 일관성 확보

모든 대출(debts) 관련 메서드명을 `loan` → `debt`로 통일:

- ✅ Store 인터페이스
- ✅ Store 구현체
- ✅ 컴포넌트 사용처
- ✅ 테스트 코드
- ✅ 관리 페이지

## 📊 변경 사항 요약

| 항목            | Before           | After            |
| --------------- | ---------------- | ---------------- |
| ID 변수         | `lastLoanId`     | `lastDebtId`     |
| 추가 메서드     | `addLoan()`      | `addDebt()`      |
| 제거 메서드     | `removeLoan()`   | `removeDebt()`   |
| 업데이트 메서드 | `updateLoan()`   | `updateDebt()`   |
| 재정렬 메서드   | `reorderLoans()` | `reorderDebts()` |

## ✅ 검증 완료

- ✅ TypeScript 컴파일 오류 없음
- ✅ 모든 테스트 통과 (12/12)
- ✅ 일관된 네이밍 적용
- ✅ 기존 데이터 호환성 유지 (localStorage 키는 동일)

## 🔄 마이그레이션

### 데이터 호환성

- **localStorage 키**: `debts-storage` (변경 없음)
- **데이터 구조**: `DebtsItem[]` (변경 없음)
- **기존 데이터**: 완전히 호환됨

### Breaking Changes

컴포넌트에서 store 메서드를 사용하는 경우 메서드명 변경 필요:

```typescript
// Before
const addLoan = useDebtsStore((state) => state.addLoan);
const updateLoan = useDebtsStore((state) => state.updateLoan);
const removeLoan = useDebtsStore((state) => state.removeLoan);

// After
const addDebt = useDebtsStore((state) => state.addDebt);
const updateDebt = useDebtsStore((state) => state.updateDebt);
const removeDebt = useDebtsStore((state) => state.removeDebt);
```

## 📝 네이밍 규칙

대출 관련 네이밍 통일:

- **Store**: `useDebtsStore` (복수형)
- **Type**: `DebtsItem` (복수형)
- **메서드**: `addDebt`, `removeDebt`, `updateDebt` (단수형)
- **변수**: `debt`, `debts` (단수/복수)
- **ID**: `lastDebtId`, `debtId` (debt 사용)
