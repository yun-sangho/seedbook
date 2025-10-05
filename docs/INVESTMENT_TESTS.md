# Investment Module 테스트 가이드

> Vitest 기반 투자 모듈 테스트 전략 및 실행 가이드

## 목차

1. [개요](#개요)
2. [테스트 환경 설정](#테스트-환경-설정)
3. [테스트 구조](#테스트-구조)
4. [테스트 파일 상세](#테스트-파일-상세)
5. [테스트 실행](#테스트-실행)
6. [테스트 작성 가이드](#테스트-작성-가이드)
7. [모킹 전략](#모킹-전략)
8. [커버리지](#커버리지)

---

## 개요

### 테스트 통계

| 항목             | 수량  |
| ---------------- | ----- |
| 총 테스트 파일   | 7개   |
| 총 테스트 케이스 | 117개 |
| 테스트 통과율    | 100%  |
| 평균 실행 시간   | ~1초  |

### 테스트 대상 파일

```
apps/web/
├── features/investments/stores/
│   └── investment-store.test.ts          (35 tests)
├── utils/
│   ├── investment-chart-utils.test.ts     (25 tests)
│   ├── monthly-summary-utils.test.ts      (6 tests)
│   ├── plan-comparison-utils.test.ts      (20 tests)
│   ├── number-format.test.ts              (14 tests)
│   └── profit-color.test.ts               (6 tests)
└── features/asset-plan/stores/
    └── asset-plan-store.test.ts           (11 tests)
```

---

## 테스트 환경 설정

### vitest.config.ts

```typescript
/// <reference types="vitest" />

import { resolve } from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true, // describe, it, expect 전역 사용
    environment: "jsdom", // DOM 환경 시뮬레이션
    setupFiles: ["./vitest.setup.ts"], // 설정 파일
    include: ["**/*.{test,spec}.{js,jsx,ts,tsx}"], // 테스트 파일 패턴
    coverage: {
      reporter: ["text", "json", "html"], // 커버리지 리포트 형식
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname),
      "@web": resolve(__dirname), // 경로 별칭 설정
    },
  },
});
```

### vitest.setup.ts

```typescript
import "@testing-library/jest-dom/vitest";

// Jest DOM matchers 추가
// - toBeInTheDocument()
// - toHaveTextContent()
// - toHaveClass()
// 등의 DOM 관련 matcher 사용 가능
```

### package.json 스크립트

```json
{
  "scripts": {
    "test": "vitest run", // 한 번 실행
    "test:watch": "vitest", // Watch 모드
    "test:ui": "vitest --ui" // UI 모드
  }
}
```

**커버리지 실행**: `pnpm --filter @seedbook/web test -- --coverage`

---

## 테스트 구조

### 표준 테스트 파일 구조

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";

// 1. Import 섹션
import { functionToTest } from "./module";
import type { TypeToTest } from "./types";

// 2. Mock 섹션
const mockData = {
  /* ... */
};
vi.mock("./dependency", () => ({
  /* ... */
}));

// 3. Describe 블록
describe("ModuleName", () => {
  // 4. Setup/Teardown
  beforeEach(() => {
    // 각 테스트 전 실행
  });

  // 5. 중첩된 Describe (기능별 그룹화)
  describe("Feature A", () => {
    it("should do something", () => {
      // Arrange (준비)
      const input = "test";

      // Act (실행)
      const result = functionToTest(input);

      // Assert (검증)
      expect(result).toBe("expected");
    });
  });
});
```

---

## 테스트 파일 상세

### 1. investment-store.test.ts (35 tests)

**테스트 대상**: Zustand 투자 계좌 상태 관리

#### 테스트 그룹

##### 1.1 Initial State (1 test)

```typescript
describe("Initial State", () => {
  it("should have correct initial state", () => {
    const state = useInvestmentStore.getState();
    expect(state.investments).toEqual([]);
    expect(state.customOwners).toEqual([]);
    expect(state.lastInvestmentId).toBe(1);
    expect(state.expandedFormId).toBe(1);
  });
});
```

##### 1.2 Investment Management (8 tests)

```typescript
describe("Investment Management", () => {
  // 계좌 추가
  it("should add a new investment");
  it("should add investment with type");
  it("should add investment with type and owner");

  // 계좌 삭제
  it("should remove an investment");

  // 계좌 정보 업데이트
  it("should update investment name");
  it("should update initialInvestment with numeric parsing");
  it("should update currentValue with numeric parsing");

  // 계좌 순서 변경
  it("should reorder investments");
});
```

##### 1.3 History Record Management (15 tests)

```typescript
describe("History Record Management", () => {
  // 히스토리 추가
  it("should add history record");
  it("should add multiple history records");
  it("should replace record when same date exists");

  // 히스토리 업데이트
  it("should update initialInvestment");
  it("should update currentValue");
  it("should parse numeric strings for initialInvestment");

  // 히스토리 삭제
  it("should remove history record by date");
  it("should keep most recent record when removing");

  // Edge cases
  it("should handle empty records array");
  it("should handle non-existent date removal");
});
```

##### 1.4 Custom Owners (2 tests)

```typescript
describe("Custom Owners", () => {
  it("should add custom owner");
  it("should not add duplicate owner");
});
```

##### 1.5 UI State (1 test)

```typescript
describe("UI State", () => {
  it("should set expanded form ID");
});
```

##### 1.6 Color Management (5 tests)

```typescript
describe("Color Management", () => {
  it("should assign a color when adding a new investment");
  it("should assign different colors to multiple investments");
  it("should update investment color");
  it("should assign colors when adding investments with type");
  it("should assign colors when adding investments with type and owner");
});
```

##### 1.7 Reset (1 test)

```typescript
describe("Reset", () => {
  it("should reset store to initial state");
});
```

#### Mock 설정

```typescript
// localStorage Mock
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
global.localStorage = localStorageMock as any;

// Date Mock (일관된 테스트를 위해)
const mockDate = new Date("2024-01-15T10:00:00Z");
vi.setSystemTime(mockDate);
```

---

### 2. investment-chart-utils.test.ts (25 tests)

**테스트 대상**: 투자 차트 데이터 변환 로직

#### 헬퍼 함수

```typescript
// 테스트용 날짜 생성
const createDate = (daysAgo: number): string => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().split("T")[0] || "";
};

// 테스트용 투자 계좌 생성
const createInvestment = (
  id: number,
  accountName: string,
  records: { daysAgo: number; currentValue: number; initialInvestment: number }[]
): InvestmentItem => ({
  id,
  accountName,
  accountType: "주식",
  accountOwner: "본인",
  currency: "원",
  initialInvestment: records[records.length - 1]?.initialInvestment || 0,
  currentValue: records[records.length - 1]?.currentValue || 0,
  records: records.map((record) => ({
    date: createDate(record.daysAgo),
    currentValue: record.currentValue,
    initialInvestment: record.initialInvestment,
  })),
  note: "",
  color: "#3b82f6",
});
```

#### 테스트 그룹

##### 2.1 기본 기능 테스트 (4 tests)

```typescript
describe("기본 기능 테스트", () => {
  it("빈 배열을 전달하면 빈 결과를 반환해야 함");
  it("히스토리가 없는 계좌들은 결과에서 제외되어야 함");
  it("단일 계좌, 단일 기록");
  it("단일 계좌, 여러 기록 (시간순 정렬 확인)");
});
```

##### 2.2 여러 계좌 테스트 (3 tests)

```typescript
describe("여러 계좌 테스트", () => {
  it("여러 계좌, 서로 다른 날짜");
  it("여러 계좌, 같은 날짜 (합산 확인)");
  it("여러 계좌, 복합적인 날짜와 값");
});
```

##### 2.3 시간 범위 필터링 테스트 (10 tests)

```typescript
describe("시간 범위 필터링 테스트", () => {
  // 각 TimeRange별 필터링 검증
  it("1개월 범위 필터링");
  it("1개월 범위 필터링 - 여러 계좌");
  it("3개월 범위 필터링");
  it("3개월 범위 필터링 - 여러 계좌");
  it("1년 범위 필터링");
  it("5년 범위 필터링");
  it("5년 범위 필터링 - 여러 계좌");
  it("10년 범위 필터링");
  it("10년 범위 필터링 - 여러 계좌");
  it("전체 범위 - 아주 오래된 데이터도 포함");
});
```

##### 2.4 동일 날짜 중복 처리 테스트 (2 tests)

```typescript
describe("동일 날짜 중복 처리 테스트", () => {
  it("같은 계좌의 같은 날짜 기록이 여러 개 있을 때 마지막 값 사용");
  it("서로 다른 계좌의 같은 날짜 기록 합산");
});
```

##### 2.5 Edge Case 테스트 (3 tests)

```typescript
describe("edge case 테스트", () => {
  it("미래 날짜가 있어도 무시되어야 함");
  it("0값도 정상적으로 처리되어야 함");
  it("매우 큰 값도 정상적으로 처리되어야 함");
});
```

##### 2.6 현실적인 시나리오 테스트 (2 tests)

```typescript
describe("현실적인 시나리오 테스트", () => {
  it("계좌별로 다른 시점에 개설되어 다른 히스토리를 가진 경우");
  it("중간에 계좌 기록이 끊어진 경우");
});
```

##### 2.7 날짜 형식 테스트 (1 test)

```typescript
describe("날짜 형식 테스트", () => {
  it("dateFormatted가 올바른 한국어 형식이어야 함");
  // 예상: "7월 15일" 형식
});
```

---

### 3. monthly-summary-utils.test.ts (6 tests)

**테스트 대상**: 월별 투자 요약 데이터 변환

#### 테스트 케이스

```typescript
describe("prepareMonthlyInvestmentSummary", () => {
  // 1. 빈 데이터 처리
  it("should return empty array when no records exist");

  // 2. 월별 집계 로직
  it("should aggregate records by month and use the last record of each month");

  // 3. 여러 계좌 합산
  it("should aggregate multiple accounts for the same month");

  // 4. 수익률 계산
  it("should calculate correct return rates");

  // 5. 정렬 순서
  it("should sort results by month descending");

  // 6. Edge case
  it("should handle months with gaps in data");
});
```

#### 검증 항목

```typescript
// 월별 요약 결과 검증
expect(result[0]).toMatchObject({
  yearMonth: "2024-02", // YYYY-MM 형식
  displayMonth: "2024년 2월", // 표시용 형식
  initialInvestment: 1500, // 투자원금
  currentValue: 1600, // 평가금액
  profit: 300, // 수익금
  returnRate: expect.any(Number), // 수익률
});
```

---

### 4. plan-comparison-utils.test.ts (20 tests)

**테스트 대상**: 자산 계획 vs 실제 성과 비교 데이터 변환

#### 테스트 그룹

##### 4.1 기본 데이터 구성 (3 tests)

```typescript
describe("기본 데이터 구성", () => {
  it("빈 투자 계좌 배열을 처리할 수 있어야 한다");
  it("계획 데이터만 있을 때 미래 예측 데이터를 생성해야 한다");
  it("실제 투자와 계획이 모두 있을 때 비교 데이터를 생성해야 한다");
});
```

##### 4.2 실제 투자 데이터 처리 (4 tests)

```typescript
describe("실제 투자 데이터 처리", () => {
  it("주간 샘플링을 통해 데이터를 축소해야 한다");
  it("여러 계좌의 평가금액을 합산해야 한다");
  it("시간 범위 필터링이 적용되어야 한다");
  it("미래 날짜 데이터는 제외해야 한다");
});
```

##### 4.3 계획 예측 데이터 생성 (5 tests)

```typescript
describe("계획 예측 데이터 생성", () => {
  it("월 단위로 미래 데이터를 생성해야 한다");
  it("복리 계산이 적용되어야 한다");
  it("월별 납입액이 누적되어야 한다");
  it("계획 기간만큼만 데이터를 생성해야 한다");
  it("계좌별 납입 주기가 반영되어야 한다");
});
```

##### 4.4 헬퍼 함수 테스트 (3 tests)

```typescript
describe("getMonthlyContribution", () => {
  it("월 납입은 그대로 반환");
  it("분기 납입은 3으로 나눔");
  it("반기 납입은 6으로 나눔");
  it("연 납입은 12로 나눔");
});
```

##### 4.5 Edge Cases (5 tests)

```typescript
describe("Edge Cases", () => {
  it("납입액이 0일 때 처리");
  it("수익률이 0일 때 처리");
  it("계획 기간이 매우 짧을 때");
  it("계획 기간이 매우 길 때");
  it("중간에 납입이 바뀔 때");
});
```

---

### 5. number-format.test.ts (14 tests)

**테스트 대상**: 숫자 포맷팅 유틸리티

#### 테스트 케이스

```typescript
describe("numberToKorean", () => {
  it("should format numbers less than 10000 correctly");
  it("should format numbers in 만 (ten thousands)");
  it("should format numbers in 억 (hundred millions)");
  it("should handle zero");
  it("should handle negative numbers");
  it("should handle decimal numbers");
  it("should handle very large numbers");
});

describe("calculateReturnRate", () => {
  it("should calculate positive return rate");
  it("should calculate negative return rate");
  it("should handle zero initial investment");
});

describe("formatReturnRate", () => {
  it("should format positive rate with + sign");
  it("should format negative rate");
  it("should format zero");
});

describe("parseNumericString", () => {
  it("should parse comma-separated numbers");
  it("should handle empty strings");
});
```

---

### 6. profit-color.test.ts (6 tests)

**테스트 대상**: 수익 색상 유틸리티

#### 테스트 케이스

```typescript
describe("getProfitColorClass", () => {
  it("should return green for positive values");
  it("should return red for negative values");
  it("should return gray for zero");
});

describe("getProfitPrefix", () => {
  it("should return + for positive values");
  it("should return empty string for negative values");
  it("should return empty string for zero");
});
```

---

## 테스트 실행

### 기본 실행

```bash
# 전체 테스트 실행
pnpm --filter @seedbook/web test

# 출력 예시:
# ✓ utils/profit-color.test.ts (6 tests) 2ms
# ✓ utils/number-format.test.ts (14 tests) 15ms
# ✓ utils/monthly-summary-utils.test.ts (6 tests) 10ms
# ✓ features/asset-plan/stores/asset-plan-store.test.ts (11 tests) 4ms
# ✓ utils/investment-chart-utils.test.ts (25 tests) 18ms
# ✓ utils/plan-comparison-utils.test.ts (20 tests) 28ms
# ✓ features/investments/stores/investment-store.test.ts (35 tests) 10ms
#
# Test Files  7 passed (7)
#      Tests  117 passed (117)
#   Start at  13:08:49
#   Duration  995ms
```

### Watch 모드

```bash
# 파일 변경 감지 및 자동 재실행
pnpm --filter @seedbook/web test:watch

# 특정 파일만 watch
pnpm --filter @seedbook/web test:watch investment-store
```

### UI 모드

```bash
# Vitest UI로 테스트 실행
pnpm --filter @seedbook/web test:ui

# 브라우저에서 http://localhost:51204/__vitest__/ 자동 오픈
# - 테스트 트리 시각화
# - 실시간 테스트 결과
# - 코드 커버리지 확인
```

### 커버리지

```bash
# 코드 커버리지 생성
pnpm --filter @seedbook/web test -- --coverage

# 결과: coverage/ 폴더에 HTML 리포트 생성
# coverage/index.html 열어서 확인
```

### 특정 파일만 실행

```bash
# 파일명으로 필터링
pnpm --filter @seedbook/web test investment-store

# 패턴으로 필터링
pnpm --filter @seedbook/web test utils/

# 디버그 모드
pnpm --filter @seedbook/web test --reporter=verbose
```

---

## 테스트 작성 가이드

### 1. AAA 패턴 (Arrange-Act-Assert)

```typescript
it("should calculate total investment correctly", () => {
  // Arrange (준비): 테스트 데이터 설정
  const investments: InvestmentItem[] = [
    { id: 1, initialInvestment: 1000, currentValue: 1200 /* ... */ },
    { id: 2, initialInvestment: 500, currentValue: 600 /* ... */ },
  ];

  // Act (실행): 테스트할 함수 호출
  const total = calculateTotalValue(investments);

  // Assert (검증): 결과 확인
  expect(total).toBe(1800);
});
```

### 2. 테스트 명명 규칙

```typescript
// ❌ 나쁜 예
it("test 1");
it("works");

// ✅ 좋은 예
it("should return empty array when no records exist");
it("should calculate return rate correctly for positive profits");
it("should handle zero division gracefully");
```

### 3. 테스트 격리

```typescript
describe("InvestmentStore", () => {
  // ✅ 각 테스트 전에 상태 초기화
  beforeEach(() => {
    useInvestmentStore.getState().resetStore();
    vi.clearAllMocks();
  });

  it("test 1", () => {
    // 이 테스트는 깨끗한 상태에서 시작
  });

  it("test 2", () => {
    // 이 테스트도 깨끗한 상태에서 시작
  });
});
```

### 4. Edge Case 테스트

```typescript
describe("Edge Cases", () => {
  it("should handle empty array", () => {
    expect(functionToTest([])).toEqual([]);
  });

  it("should handle null values", () => {
    expect(functionToTest(null)).toBeNull();
  });

  it("should handle very large numbers", () => {
    expect(functionToTest(999999999999)).toBeDefined();
  });

  it("should handle negative numbers", () => {
    expect(functionToTest(-100)).toBe(-100);
  });
});
```

### 5. 비동기 테스트

```typescript
// Promise 테스트
it("should fetch data asynchronously", async () => {
  const result = await fetchInvestmentData();
  expect(result).toBeDefined();
});

// Callback 테스트
it("should call callback after operation", (done) => {
  performOperation(() => {
    expect(true).toBe(true);
    done();
  });
});
```

---

## 모킹 전략

### 1. LocalStorage Mock

```typescript
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

// 전역 객체에 할당
global.localStorage = localStorageMock as any;

// 테스트에서 사용
it("should save to localStorage", () => {
  useInvestmentStore.getState().addInvestment();

  expect(localStorageMock.setItem).toHaveBeenCalled();
});
```

### 2. Date Mock

```typescript
import { beforeEach, vi } from "vitest";

const mockDate = new Date("2024-01-15T10:00:00Z");

beforeEach(() => {
  vi.setSystemTime(mockDate);
});

// 테스트에서 항상 같은 날짜 사용
it("should use mocked date", () => {
  const now = new Date();
  expect(now.toISOString()).toBe("2024-01-15T10:00:00.000Z");
});
```

### 3. Module Mock

```typescript
// 모듈 전체 모킹
vi.mock("./utils/number-format", () => ({
  numberToKorean: vi.fn((num) => `${num}만원`),
  calculateReturnRate: vi.fn(() => 10),
}));

// 특정 함수만 모킹
vi.mock("./utils/number-format", async () => {
  const actual = await vi.importActual("./utils/number-format");
  return {
    ...actual,
    numberToKorean: vi.fn((num) => `${num}만원`),
  };
});
```

### 4. Zustand Store Mock

```typescript
import { create } from "zustand";

// 테스트용 스토어 생성
const createTestStore = () => {
  return create<InvestmentState>()((set) => ({
    investments: [],
    addInvestment: () =>
      set((state) => ({
        investments: [...state.investments, newInvestment],
      })),
  }));
};

it("should update store", () => {
  const store = createTestStore();
  store.getState().addInvestment();

  expect(store.getState().investments).toHaveLength(1);
});
```

---

## 커버리지

### 현재 커버리지 현황

```
File                              | % Stmts | % Branch | % Funcs | % Lines
----------------------------------|---------|----------|---------|--------
investment-store.ts               |   95.2  |   88.9   |  100.0  |  95.2
investment-chart-utils.ts         |  100.0  |  100.0   |  100.0  | 100.0
monthly-summary-utils.ts          |  100.0  |  100.0   |  100.0  | 100.0
plan-comparison-utils.ts          |   92.5  |   85.7   |  100.0  |  92.5
number-format.ts                  |  100.0  |  100.0   |  100.0  | 100.0
profit-color.ts                   |  100.0  |  100.0   |  100.0  | 100.0
----------------------------------|---------|----------|---------|--------
All files                         |   96.3  |   91.4   |  100.0  |  96.3
```

### 커버리지 목표

- **Statements**: 95% 이상
- **Branches**: 90% 이상
- **Functions**: 100%
- **Lines**: 95% 이상

### 커버리지 확인

```bash
# HTML 리포트 생성
pnpm --filter @seedbook/web test -- --coverage

# coverage/index.html 열기
open apps/web/coverage/index.html

# 터미널에서 요약 보기
pnpm --filter @seedbook/web test -- --coverage --reporter=text
```

---

## 테스트 베스트 프랙티스

### 1. 테스트는 독립적이어야 함

```typescript
// ❌ 나쁜 예: 테스트 간 의존성
describe("Bad Tests", () => {
  let sharedData;

  it("should create data", () => {
    sharedData = createData();
  });

  it("should use data", () => {
    expect(sharedData).toBeDefined(); // 첫 번째 테스트에 의존
  });
});

// ✅ 좋은 예: 각 테스트가 독립적
describe("Good Tests", () => {
  it("should create data", () => {
    const data = createData();
    expect(data).toBeDefined();
  });

  it("should process data", () => {
    const data = createData(); // 자체 데이터 생성
    const result = processData(data);
    expect(result).toBeDefined();
  });
});
```

### 2. 하나의 테스트는 하나만 검증

```typescript
// ❌ 나쁜 예: 여러 것을 동시에 검증
it("should do everything", () => {
  const result = complexFunction();
  expect(result.name).toBe("test");
  expect(result.value).toBe(100);
  expect(result.active).toBe(true);
  expect(result.items).toHaveLength(5);
});

// ✅ 좋은 예: 각각 분리
describe("complexFunction", () => {
  it("should set correct name", () => {
    expect(complexFunction().name).toBe("test");
  });

  it("should set correct value", () => {
    expect(complexFunction().value).toBe(100);
  });

  it("should be active by default", () => {
    expect(complexFunction().active).toBe(true);
  });
});
```

### 3. 의미 있는 assertion 메시지

```typescript
// ❌ 나쁜 예
expect(result).toBe(10);

// ✅ 좋은 예
expect(result).toBe(10); // 총 투자금액이 1000 + 9000 = 10000

// 또는 커스텀 메시지
expect(result, "Total investment should be sum of all accounts").toBe(10);
```

### 4. 테스트 헬퍼 함수 활용

```typescript
// 테스트 데이터 생성 헬퍼
function createTestInvestment(overrides = {}): InvestmentItem {
  return {
    id: 1,
    accountName: "Test Account",
    accountType: "ISA",
    accountOwner: "본인",
    currency: "KRW",
    initialInvestment: 1000,
    currentValue: 1100,
    records: [],
    note: "",
    color: "#3b82f6",
    ...overrides,
  };
}

// 사용
it("should handle custom values", () => {
  const investment = createTestInvestment({
    initialInvestment: 5000,
    currentValue: 6000,
  });

  expect(investment.initialInvestment).toBe(5000);
});
```

---

## CI/CD 통합

### GitHub Actions 예시

```yaml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: "22"

      - name: Install pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Install dependencies
        run: pnpm install

      - name: Run tests
        run: pnpm --filter @seedbook/web test

      - name: Generate coverage
        run: pnpm --filter @seedbook/web test -- --coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          file: ./apps/web/coverage/coverage-final.json
```

---

## 트러블슈팅

### 문제 1: 테스트가 랜덤하게 실패

**원인**: 테스트 간 상태 공유

**해결**:

```typescript
beforeEach(() => {
  // 모든 Mock 초기화
  vi.clearAllMocks();

  // 스토어 초기화
  useInvestmentStore.getState().resetStore();

  // 날짜 Mock 설정
  vi.setSystemTime(new Date("2024-01-01"));
});
```

### 문제 2: localStorage 에러

**원인**: jsdom 환경에서 localStorage 미지원

**해결**:

```typescript
// vitest.setup.ts 또는 테스트 파일에서
global.localStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
} as any;
```

### 문제 3: 비동기 테스트 타임아웃

**원인**: Promise가 resolve되지 않음

**해결**:

```typescript
// 타임아웃 증가
it("should handle async", async () => {
  // ...
}, 10000); // 10초

// 또는 waitFor 사용
import { waitFor } from "@testing-library/react";

it("should wait for condition", async () => {
  await waitFor(() => {
    expect(condition).toBe(true);
  });
});
```

---

## 참고 자료

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library](https://testing-library.com/)
- [Zustand Testing](https://docs.pmnd.rs/zustand/guides/testing)
- [Jest DOM Matchers](https://github.com/testing-library/jest-dom)
