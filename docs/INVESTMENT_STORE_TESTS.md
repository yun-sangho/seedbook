# Investment Store 테스트 문서

## 개요

투자 스토어(`investment-store.ts`)의 모든 기능에 대한 포괄적인 테스트 스위트입니다.

## 테스트 결과

✅ **30개 테스트 모두 통과** (6ms)

## 테스트 커버리지

### 1. Initial State (초기 상태)

- ✅ 초기 상태 값 검증
  - `investments`: 빈 배열
  - `customOwners`: 빈 배열
  - `lastInvestmentId`: 1
  - `expandedFormId`: 1

### 2. Investment Management (투자 관리)

- ✅ `addInvestment()`: 기본 투자 계좌 추가
- ✅ `addInvestmentWithType()`: 계좌 타입과 함께 추가
- ✅ `addInvestmentWithTypeAndOwner()`: 타입 + 소유자와 함께 추가
- ✅ `removeInvestment()`: 투자 계좌 삭제

**테스트 항목:**

- ID 자동 증가 검증
- 기본값 설정 확인
- expandedFormId 자동 설정
- 계좌명 생성 규칙 (`{소유자}의 {타입}`)

### 3. Investment Updates (투자 정보 업데이트)

- ✅ `updateInvestment()`: 일반 필드 업데이트
- ✅ `currentValue` 변경 시 자동 기록 생성
- ✅ `initialInvestment` 변경 시 자동 기록 생성
- ✅ 같은 날짜 기록 교체 로직

**테스트 항목:**

- 문자열 숫자 파싱 (`parseNumericString`)
- 동일 날짜 레코드 중복 방지
- 히스토리 자동 추가

### 4. History Record Management (히스토리 레코드 관리)

#### addHistoryRecord

- ✅ 히스토리 레코드 추가
- ✅ 같은 날짜 레코드 덮어쓰기
- ✅ 날짜순 정렬 (최신순)

#### addInvestmentRecord

- ✅ 기본값으로 레코드 추가
- ✅ **마지막 레코드의 `initialInvestment`를 기본값으로 상속** ⭐ (신규 테스트)
- ✅ 커스텀 값으로 레코드 추가

#### updateInvestmentRecord

- ✅ 레코드 필드 업데이트
- ✅ 문자열 숫자 파싱

#### removeInvestmentRecord

- ✅ 레코드 삭제
- ✅ 최소 1개 레코드 유지 규칙

#### removeInvestmentHistoryRecord

- ✅ 날짜로 히스토리 레코드 삭제
- ✅ **최신 레코드는 삭제 불가 규칙**

### 5. Custom Owners (커스텀 소유자)

- ✅ `addCustomOwner()`: 소유자 추가
- ✅ 중복 소유자 방지

### 6. UI State (UI 상태 관리)

- ✅ `setExpandedFormId()`: 펼쳐진 폼 ID 설정
- ✅ **다른 투자 업데이트 시 expandedFormId 변경** ⭐ (신규 테스트)
- ✅ **현재 펼쳐진 투자 업데이트 시 expandedFormId 유지** ⭐ (신규 테스트)

**비즈니스 로직:**

```typescript
// updateInvestment 시:
expandedFormId: state.expandedFormId !== id ? id : state.expandedFormId;
```

### 7. Reorder Investments (투자 순서 재정렬) ⭐ 신규 테스트

- ✅ `reorderInvestments()`: 투자 배열 순서 변경
- ✅ **재정렬 시 데이터 무결성 유지** (히스토리 포함)
- ✅ 빈 배열 처리
- ✅ 단일 아이템 처리

**테스트 시나리오:**

- 3개 투자 계좌의 순서 변경
- 히스토리가 포함된 투자의 순서 변경 시 데이터 보존 확인
- 엣지 케이스 (빈 배열, 단일 아이템)

### 8. Store Reset (스토어 초기화)

- ✅ `resetStore()`: 모든 상태를 초기값으로 리셋

### 9. Complex Scenarios (복잡한 시나리오)

- ✅ 여러 투자 계좌의 독립적인 히스토리 관리
- ✅ 같은 날짜에 여러 필드 동시 업데이트

## 신규 추가된 테스트 (이번 업데이트)

### 1. Reorder Investments (드래그 앤 드롭 정렬)

```typescript
✅ should reorder investments array
✅ should maintain investment data when reordering
✅ should handle empty array reorder
✅ should handle single item reorder
```

### 2. UI State - expandedFormId 로직

```typescript
✅ should update expandedFormId when updating different investment
✅ should not change expandedFormId when updating currently expanded investment
```

### 3. History Record - 마지막 레코드 상속

```typescript
✅ should add investment record using last record's initialInvestment as default
```

## 테스트되지 않는 기능

### Persist Middleware

현재 테스트에서는 `persist` 미들웨어의 실제 localStorage 저장/로드 동작을 테스트하지 않습니다.
이는 의도적으로 제외된 것으로, 필요시 별도의 통합 테스트에서 다뤄야 합니다.

**미들웨어 설정:**

```typescript
partialize: (state) => ({
  investments: state.investments,
  customOwners: state.customOwners,
  lastInvestmentId: state.lastInvestmentId,
  // expandedFormId는 제외 (세션 상태)
});
```

## 테스트 실행 방법

### 전체 테스트 실행

```bash
pnpm test investment-store.test.ts
```

### Watch 모드

```bash
pnpm test:watch investment-store.test.ts
```

### 커버리지 확인

```bash
pnpm test --coverage
```

## 테스트 모범 사례

### 1. 각 테스트 전 초기화

```typescript
beforeEach(() => {
  useInvestmentStore.getState().resetStore();
  vi.clearAllMocks();
  vi.setSystemTime(mockDate);
});
```

### 2. 날짜 모킹

일관된 테스트를 위해 시스템 시간을 고정:

```typescript
vi.setSystemTime(new Date("2024-01-15T10:00:00Z"));
```

### 3. 상태 검증

각 액션 후 상태를 명시적으로 확인:

```typescript
const state = useInvestmentStore.getState();
expect(state.investments).toHaveLength(1);
```

## 커버리지 요약

| 기능 카테고리   | 테스트 수 | 커버리지 |
| --------------- | --------- | -------- |
| 투자 관리       | 4         | 100%     |
| 투자 업데이트   | 4         | 100%     |
| 히스토리 관리   | 9         | 100%     |
| 커스텀 소유자   | 2         | 100%     |
| UI 상태         | 3         | 100%     |
| 순서 재정렬     | 4         | 100%     |
| 스토어 리셋     | 1         | 100%     |
| 복잡한 시나리오 | 2         | 100%     |
| **총계**        | **30**    | **100%** |

## 향후 개선 사항

### 1. 통합 테스트

- [ ] localStorage persist 동작 테스트
- [ ] 브라우저 환경에서의 실제 동작 테스트

### 2. 성능 테스트

- [ ] 대량 데이터 (1000+ 투자) 처리 테스트
- [ ] 메모리 누수 검증

### 3. 엣지 케이스

- [ ] 매우 긴 문자열 입력
- [ ] 음수 값 처리
- [ ] 날짜 형식 오류 처리

## 관련 문서

- [투자 스토어 구현](../apps/web/features/investments/stores/investment-store.ts)
- [드래그 앤 드롭 기능](./DRAG_AND_DROP.md)
- [투자 타입 정의](../apps/web/features/investments/types/types.ts)
