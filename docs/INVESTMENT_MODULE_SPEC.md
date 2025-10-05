# Investment Module 기술 명세서

> 투자 계좌 관리 및 성과 추적 모듈

## 목차

1. [개요](#개요)
2. [아키텍처](#아키텍처)
3. [데이터 구조](#데이터-구조)
4. [상태 관리](#상태-관리)
5. [주요 기능](#주요-기능)
6. [컴포넌트 구조](#컴포넌트-구조)
7. [유틸리티 함수](#유틸리티-함수)
8. [차트 시각화](#차트-시각화)
9. [테스트](#테스트)
10. [기술 스택](#기술-스택)

---

## 개요

Investment 모듈은 사용자의 투자 계좌를 관리하고, 시간에 따른 투자 성과를 추적하며, 다양한 차트를 통해 시각화하는 기능을 제공합니다.

### 핵심 기능

- 📊 **다중 계좌 관리**: 여러 투자 계좌를 한 곳에서 관리
- 📈 **히스토리 추적**: 시간별 투자 원금 및 평가금액 기록
- 🎨 **시각화**: Stacked Area Chart를 통한 계좌별 성과 비교
- 🎯 **수익률 계산**: 실시간 수익금 및 수익률 계산
- 📅 **월별 요약**: 월 단위 투자 성과 집계
- 🎨 **색상 관리**: 계좌별 30가지 색상 팔레트

### 금액 단위 규칙 (중요)

**모든 내부 숫자는 만원(10,000 KRW) 단위로 저장됩니다.**

- `initialInvestment`, `currentValue` 등 모든 금액 필드는 만원 단위
- 내부 계산 시 추가 스케일링 **금지** (이중 변환 방지)
- 표시 시에만 `numberToKorean()` 사용 (억/만 단위 변환)
- 예: 1000 = 1,000만원 = 1억원

---

## 아키텍처

```
apps/web/
├── app/assets/investments/              # 페이지 및 UI 컴포넌트
│   ├── page.tsx                         # 메인 페이지
│   └── _components/                     # 프라이빗 컴포넌트
│       ├── investment-manager.tsx       # 계좌 관리 메인
│       ├── investment-item.tsx          # 개별 계좌 아이템
│       ├── investment-summary.tsx       # 전체 요약
│       ├── add-investment-modal.tsx     # 계좌 추가 모달
│       ├── add-history-modal.tsx        # 히스토리 추가 모달
│       ├── monthly-summary-columns.tsx  # 월별 요약 테이블 컬럼
│       └── monthly-summary-data-table.tsx
│
├── features/investments/                # 비즈니스 로직
│   ├── stores/
│   │   └── investment-store.ts          # Zustand 상태 관리
│   └── types/
│       ├── types.ts                     # TypeScript 타입 정의
│       └── constants.ts                 # 상수 (계좌 유형, 색상 등)
│
├── components/                          # 공용 차트 컴포넌트
│   ├── investment-area-chart.tsx        # 단순 Area Chart
│   └── investment-stacked-area-chart.tsx # Stacked Area Chart
│
└── utils/                               # 유틸리티 함수
    ├── investment-chart-utils.ts        # 차트 데이터 변환
    ├── stacked-area-chart-utils.ts      # Stacked 차트 데이터 변환
    ├── monthly-summary-utils.ts         # 월별 요약 데이터 변환
    ├── number-format.ts                 # 숫자 포맷팅
    └── profit-color.ts                  # 수익 색상 유틸
```

---

## 데이터 구조

### InvestmentItem (투자 계좌)

```typescript
interface InvestmentItem {
  id: number; // 고유 ID
  accountName: string; // 계좌명 (예: "본인의 ISA 계좌")
  accountType: string; // 계좌 유형 (ISA, IRP, 연금저축 등)
  accountOwner: string; // 계좌 소유자 (본인, 배우자 등)
  currency: string; // 통화 (원)
  initialInvestment: number; // 현재 투자원금 (만원 단위)
  currentValue: number; // 현재 평가금액 (만원 단위)
  records: InvestmentRecord[]; // 히스토리 기록 배열
  note: string; // 메모
  color: string; // 차트 표시 색상 (HEX)
}
```

### InvestmentRecord (히스토리 기록)

```typescript
interface InvestmentRecord {
  date: string; // 기준날짜 (YYYY-MM-DD)
  initialInvestment: number; // 투자원금 (만원 단위)
  currentValue: number; // 평가금액 (만원 단위)
}
```

### 계좌 유형 (AccountType)

```typescript
enum AccountType {
  GENERAL = "일반 투자 계좌",
  FOREIGN = "해외 투자 계좌",
  ISA = "ISA 계좌",
  IRP = "IRP 계좌",
  PENSION = "연금저축 계좌",
}
```

### 통화 유형 (CurrencyType)

```typescript
enum CurrencyType {
  KRW = "원",
}
```

### 계좌 소유자 (DefaultOwnerType)

```typescript
enum DefaultOwnerType {
  SELF = "본인",
  SPOUSE = "배우자",
}
```

---

## 상태 관리

### Zustand Store (`investment-store.ts`)

**저장 위치**: `localStorage` (키: `investment-storage`)

**Middleware**: `persist` (Zustand)

**상태 구조**:

```typescript
interface InvestmentState {
  // 데이터 (localStorage에 저장됨)
  investments: InvestmentItem[]; // 투자 계좌 배열
  customOwners: string[]; // 사용자 정의 소유자 목록
  lastInvestmentId: number; // 마지막 ID (자동 증가)

  // UI 상태 (저장 안됨)
  expandedFormId: number; // 현재 펼쳐진 폼 ID

  // 액션 메서드들...
}
```

**상태 변경 규칙** (nextjs.instructions.md 준수):

- immer 사용 안 함
- 얕은 복사(shallow clone)로 불변성 유지: `set(state => ({ ...state, field }))`
- 무거운 계산은 utils로 분리 (컴포넌트/스토어에 인라인 금지)

### 주요 액션

#### 1. 계좌 관리

```typescript
addInvestment()                        // 빈 계좌 추가
addInvestmentWithType(type: string)    // 유형 지정 계좌 추가
addInvestmentWithTypeAndOwner(type, owner) // 유형+소유자 계좌 추가
removeInvestment(id: number)           // 계좌 삭제
updateInvestment(id, field, value)     // 계좌 정보 업데이트
reorderInvestments(investments)        // 계좌 순서 변경
```

#### 2. 히스토리 관리

```typescript
addHistoryRecord(id, date, initialInvestment, currentValue);
removeInvestmentHistoryRecord(id, date);
```

#### 3. 색상 관리

- **자동 할당**: 새 계좌 생성 시 `getNextColor()` 함수가 사용 가능한 색상 자동 선택
- **수동 변경**: `updateInvestment(id, "color", "#hexColor")`

#### 4. 데이터 마이그레이션

```typescript
onRehydrateStorage: (state) => {
  // localStorage에서 데이터 로드 시 color 속성 없으면 자동 추가
};
```

---

## 주요 기능

### 1. 계좌 추가 플로우

```
사용자 클릭 "투자 계좌 추가"
    ↓
AddInvestmentModal 오픈
    ↓
계좌 유형 선택 (ISA, IRP 등)
    ↓
계좌 소유자 선택 (본인, 배우자 등)
    ↓
addInvestmentWithTypeAndOwner() 호출
    ↓
자동 색상 할당 (getNextColor)
    ↓
Store에 저장 → localStorage 동기화
    ↓
"계좌 상세" 탭으로 자동 이동
```

### 2. 히스토리 기록 플로우

```
InvestmentItem에서 "평가금액" 입력
    ↓
updateInvestment() → 현재 값 업데이트
    ↓
자동으로 InvestmentRecord 생성
  - date: 현재 날짜
  - initialInvestment: 입력한 원금
  - currentValue: 입력한 평가금액
    ↓
같은 날짜에 기록이 있으면 덮어쓰기
    ↓
records 배열에 추가 (최신순 정렬)
```

### 3. 월별 요약 계산 로직

```typescript
// monthly-summary-utils.ts
prepareMonthlyInvestmentSummary(investments)
  1. 모든 계좌의 records를 수집
  2. 날짜를 YYYY-MM 형식으로 그룹화
  3. 각 월의 마지막 날짜 기록만 선택
  4. 계좌별 마지막 기록을 합산
  5. 전월 대비 수익금/수익률 계산
  6. 최신순으로 정렬하여 반환
```

---

## 컴포넌트 구조

### 페이지 레이아웃 (page.tsx)

```tsx
<div>
  {/* 차트 영역 - 계좌가 있을 때만 표시 */}
  {investments.length > 0 && <InvestmentStackedAreaChart investments={investments} />}

  {/* 계좌 관리 영역 */}
  <InvestmentManager />
</div>
```

### InvestmentManager (계좌 관리 메인)

```tsx
// 빈 상태 처리
if (investments.length === 0) {
  return <EmptyState onAddAccount={openModal} />;
}

// 탭 구조
<Tabs>
  <Tab value="SUMMARY">
    {" "}
    // 요약 탭
    <InvestmentSummary />
  </Tab>

  <Tab value="DETAILS">
    {" "}
    // 계좌 상세 탭
    <SortableList>
      {" "}
      // Drag & Drop 가능
      {investments.map((inv) => (
        <InvestmentItemComponent />
      ))}
    </SortableList>
  </Tab>
</Tabs>;
```

### InvestmentItem (개별 계좌 카드)

**주요 UI 요소**:

- 색상 선택 버튼 (Popover)
- 계좌명 (편집 가능)
- 투자원금 입력
- 평가금액 입력
- 히스토리 기록 목록 (펼침/접기)
- 계좌 삭제 버튼

**색상 선택 UI** (shadcn/ui Popover 사용):

```tsx
<Popover>
  <PopoverTrigger>
    <button style={{ backgroundColor: item.color }} />
  </PopoverTrigger>
  <PopoverContent>
    <div className="grid grid-cols-5">
      {/* 30가지 색상 그리드 (6행 × 5열) */}
      {ACCOUNT_COLORS.map((color) => (
        <button
          key={color}
          onClick={() => handleColorChange(color)}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  </PopoverContent>
</Popover>
```

**접근성 준수** (nextjs.instructions.md 규칙):

- 모든 `Input`에 대응하는 `Label` 존재
- `Label`의 `htmlFor`와 `Input`의 `id` 일치
- 금액 한글 표기는 `aria-describedby`로 연결

### InvestmentSummary (전체 요약)

**표시 항목**:

1. **총 계좌 요약 카드**
   - 투자원금 합계
   - 평가금액 합계
   - 수익금 합계 (색상: 양수=녹색, 음수=빨강)
   - 수익률 (백분율)

2. **월별 투자 내역 테이블**
   - DataTable (정렬, 필터링 가능)
   - 컬럼: 월, 투자원금, 평가금액, 수익금, 수익률

---

## 유틸리티 함수

### 1. investment-chart-utils.ts

**시간 범위**:

```typescript
enum TimeRange {
  ONE_MONTH = "1month", // 30일
  THREE_MONTHS = "3months", // 90일
  ONE_YEAR = "1year", // 365일
  FIVE_YEARS = "5years", // 1,825일
  TEN_YEARS = "10years", // 3,650일
  ALL = "all", // 전체
}
```

**주요 함수**:

```typescript
// 투자 히스토리를 차트 데이터로 변환
prepareInvestmentChartData(
  investments: InvestmentItem[],
  timeRange: TimeRange
): InvestmentChartData[]

// 로직:
// 1. 시간 범위에 맞는 records 필터링
// 2. 미래 날짜 제외
// 3. 모든 계좌의 날짜별 평가금액 합산
// 4. 날짜순 정렬
// 5. dateFormatted (한국어) 추가
```

### 2. stacked-area-chart-utils.ts

**주요 함수**:

```typescript
// Stacked Area Chart용 데이터 변환
prepareStackedAreaChartData(
  investments: InvestmentItem[],
  timeRange: TimeRange
): { data: AccountChartData[]; config: ChartConfig }

// 반환값:
// - data: 날짜별 각 계좌의 평가금액
// - config: 계좌별 이름과 색상 매핑
```

**핵심 로직**:

```typescript
// 특정 날짜에 계좌의 평가금액 추정
getAccountValueAtDate(investment, targetDate)
  1. 정확한 날짜 기록이 있으면 그 값 사용
  2. 없으면 그 날짜 이전의 가장 최근 기록 사용
  3. 이전 기록도 없으면 0 반환
```

### 3. monthly-summary-utils.ts

**주요 함수**:

```typescript
prepareMonthlyInvestmentSummary(
  investments: InvestmentItem[]
): MonthlySummaryRow[]

// 반환 타입:
interface MonthlySummaryRow {
  yearMonth: string;          // "2024-01"
  displayMonth: string;       // "2024년 1월"
  initialInvestment: number;  // 투자원금
  currentValue: number;       // 평가금액
  profit: number;             // 수익금
  returnRate: number;         // 수익률
}
```

### 4. number-format.ts

**주요 함수**:

```typescript
// 만원 단위 숫자를 한글로 변환
numberToKorean(value: string | number): string
// 예: 12345 → "1억 2,345만원"

// 수익률 계산
calculateReturnRate(current: number, initial: number): number
// 예: (1200 - 1000) / 1000 * 100 = 20%

// 수익률 포맷
formatReturnRate(rate: number): string
// 예: 20 → "+20.00%"

// 숫자 문자열 파싱 (콤마 제거)
parseNumericString(value: string): number
```

### 5. profit-color.ts

**색상 유틸**:

```typescript
// 수익에 따른 CSS 클래스 반환
getProfitColorClass(value: number): string
// 양수: "text-green-500"
// 음수: "text-red-500"
// 0: "text-gray-500"

// 수익 접두사
getProfitPrefix(value: number): string
// 양수: "+"
// 음수: "" (마이너스는 숫자에 포함)
// 0: ""
```

---

## 차트 시각화

### InvestmentStackedAreaChart

**사용 라이브러리**: Recharts

**기능**:

- 계좌별 Stacked Area Chart
- 시간 범위 선택 (1개월, 3개월, 1년, 5년, 10년, 전체)
- 계좌별 고유 색상 표시
- 그라데이션 효과
- 툴팁에 계좌명, 금액 표시

**데이터 흐름**:

```
investments (from store)
    ↓
prepareStackedAreaChartData(investments, timeRange)
    ↓
{ data: AccountChartData[], config: ChartConfig }
    ↓
Recharts AreaChart 렌더링
```

**차트 설정**:

```typescript
// Y축 최대값: 데이터 최대값의 120%
const yAxisMax = Math.ceil(maxValue * 1.2);

// 각 계좌별 Area 컴포넌트
{accountKeys.map(key => (
  <Area
    dataKey={key}
    stackId="1"              // Stacking 활성화
    stroke={config[key].color}
    fill={`url(#gradient-${key})`}
  />
))}
```

---

## 테스트

### 테스트 구조

**테스트 파일**:

- `investment-store.test.ts` (35개 테스트)
- `investment-chart-utils.test.ts` (25개 테스트)
- `monthly-summary-utils.test.ts` (6개 테스트)
- `plan-comparison-utils.test.ts` (20개 테스트)
- `number-format.test.ts` (14개 테스트)
- `profit-color.test.ts` (6개 테스트)
- `asset-plan-store.test.ts` (11개 테스트)

**총 117개 테스트 케이스**

### investment-chart-utils.test.ts 주요 테스트

#### 1. 기본 기능 테스트

```typescript
- 빈 배열 처리
- 히스토리 없는 계좌 제외
- 단일 계좌/기록 처리
- 시간순 정렬 확인
```

#### 2. 여러 계좌 테스트

```typescript
- 서로 다른 날짜 처리
- 같은 날짜 합산
- 복합적인 날짜와 값 처리
```

#### 3. 시간 범위 필터링

```typescript
- 1개월/3개월/1년/5년/10년/전체
- 각 범위별 데이터 포함/제외 확인
- 여러 계좌에서의 범위 필터링
```

#### 4. Edge Case

```typescript
- 미래 날짜 무시
- 0값 처리
- 매우 큰 값 처리
- 중복 날짜 처리 (마지막 값 사용)
```

#### 5. 현실적 시나리오

```typescript
- 계좌별 다른 개설 시점
- 중간에 기록이 끊어진 경우
- 날짜 형식 검증
```

### investment-store.test.ts 주요 테스트

#### 1. 초기 상태

```typescript
- 빈 배열 확인
- 기본 ID 확인
```

#### 2. 계좌 관리

```typescript
- 계좌 추가
- 계좌 삭제
- 계좌 정보 업데이트
- 계좌 순서 변경
```

#### 3. 히스토리 관리

```typescript
- 히스토리 추가
- 히스토리 삭제
- 같은 날짜 중복 처리
```

#### 4. 색상 관리 (새로 추가)

```typescript
- 새 계좌에 색상 자동 할당
- 여러 계좌에 서로 다른 색상 할당
- 색상 업데이트
- 모든 생성 함수에서 색상 할당 확인
```

### 테스트 실행

```bash
# 전체 테스트
pnpm --filter @seedbook/web test

# 특정 파일 테스트
pnpm --filter @seedbook/web test investment-store

# Watch 모드
pnpm --filter @seedbook/web test --watch
```

---

## 기술 스택

### 프레임워크 & 라이브러리

| 기술             | 버전 | 용도                       |
| ---------------- | ---- | -------------------------- |
| **Next.js**      | 15+  | App Router 기반 프레임워크 |
| **React**        | 18+  | UI 라이브러리              |
| **TypeScript**   | 5+   | 타입 안정성                |
| **Zustand**      | 4+   | 상태 관리                  |
| **Recharts**     | 2+   | 차트 라이브러리            |
| **Tailwind CSS** | 3+   | 스타일링                   |
| **shadcn/ui**    | -    | UI 컴포넌트 라이브러리     |
| **Vitest**       | 3+   | 테스트 프레임워크          |
| **dnd-kit**      | -    | Drag & Drop                |

### shadcn/ui 컴포넌트 사용

```typescript
// UI 컴포넌트
import { Button } from "@web/components/ui/button";
import { Card, CardContent, CardHeader } from "@web/components/ui/card";
import { Input } from "@web/components/ui/input";
import { Label } from "@web/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@web/components/ui/tabs";
import { Dialog, DialogContent } from "@web/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@web/components/ui/popover";
import { Badge } from "@web/components/ui/badge";

// 차트 컴포넌트
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@web/components/ui/chart";

// 커스텀 컴포넌트
import { SortableList, SortableItem } from "@web/components/ui/sortable-*";
import { AssetNameInput } from "@web/components/ui/asset-name-input";
```

### Zustand Middleware

```typescript
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

// Persist 설정
persist(
  (set, get) => ({
    /* state */
  }),
  {
    name: "investment-storage",
    storage: createJSONStorage(() => localStorage),
    partialize: (state) => ({
      investments: state.investments,
      customOwners: state.customOwners,
      lastInvestmentId: state.lastInvestmentId,
    }),
    onRehydrateStorage: () => (state) => {
      // 마이그레이션 로직
    },
  }
);
```

---

## 색상 시스템

### 30가지 색상 팔레트

6가지 기본 색상 × 5단계 명도 = 30가지

```typescript
export const ACCOUNT_COLORS = [
  // Red 계열 (400-800)
  "#f87171",
  "#ef4444",
  "#dc2626",
  "#b91c1c",
  "#991b1b",

  // Yellow 계열 (400-800)
  "#facc15",
  "#eab308",
  "#ca8a04",
  "#a16207",
  "#854d0e",

  // Green 계열 (400-800)
  "#4ade80",
  "#22c55e",
  "#16a34a",
  "#15803d",
  "#166534",

  // Cyan 계열 (400-800)
  "#22d3ee",
  "#06b6d4",
  "#0891b2",
  "#0e7490",
  "#155e75",

  // Blue 계열 (400-800)
  "#60a5fa",
  "#3b82f6",
  "#2563eb",
  "#1d4ed8",
  "#1e40af",

  // Purple 계열 (400-800)
  "#c084fc",
  "#a855f7",
  "#9333ea",
  "#7e22ce",
  "#6b21a8",
];
```

**색상 선택 전략**:

- 색상환에서 균등 분산 (약 60도 간격)
- 각 계열 내 5단계 명도로 구분
- Tailwind oklch 색상 사용 (색상 일관성)

---

## 데이터 흐름 다이어그램

```
┌─────────────────────────────────────────────────────────────┐
│                    Investment Module                         │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────┐      ┌──────────────┐      ┌────────────┐ │
│  │ User Action │─────▶│ Store Action │─────▶│ localStorage││
│  │ (UI Event)  │      │ (Zustand)    │      │  (Persist)  ││
│  └─────────────┘      └──────────────┘      └────────────┘ │
│         │                     │                     │        │
│         │                     ▼                     │        │
│         │            ┌──────────────┐               │        │
│         │            │ State Update │               │        │
│         │            └──────────────┘               │        │
│         │                     │                     │        │
│         ▼                     ▼                     ▼        │
│  ┌─────────────┐      ┌──────────────┐      ┌────────────┐ │
│  │  Component  │◀─────│ useInvestment│◀─────│  Hydrate   ││
│  │  Re-render  │      │    Store     │      │ (on load)  ││
│  └─────────────┘      └──────────────┘      └────────────┘ │
│         │                                                    │
│         ▼                                                    │
│  ┌─────────────────────────────────────┐                   │
│  │  Utils (Data Transformation)        │                   │
│  │  - prepareInvestmentChartData()     │                   │
│  │  - prepareStackedAreaChartData()    │                   │
│  │  - prepareMonthlyInvestmentSummary()│                   │
│  └─────────────────────────────────────┘                   │
│         │                                                    │
│         ▼                                                    │
│  ┌─────────────────────────────────────┐                   │
│  │  Chart Rendering (Recharts)         │                   │
│  │  - InvestmentStackedAreaChart       │                   │
│  │  - InvestmentAreaChart              │                   │
│  └─────────────────────────────────────┘                   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 성능 최적화

**원칙** (nextjs.instructions.md 준수):

- 차트 데이터는 `useMemo`로 메모이제이션
- 새 객체/배열 생성 최소화 (리렌더링 방지)
- 재사용 숫자 상수는 파일 레벨 `const`로 추출

### 1. useMemo 활용

```typescript
// 투자 총계 계산 메모이제이션
const totals = useMemo(() => {
  const totalInitialInvestment = investments.reduce(
    (sum, inv) => sum + (inv.initialInvestment || 0),
    0
  );
  const totalCurrentValue = investments.reduce((sum, inv) => sum + (inv.currentValue || 0), 0);
  const totalProfit = totalCurrentValue - totalInitialInvestment;

  return { totalInitialInvestment, totalCurrentValue, totalProfit };
}, [investments]);

// 월별 데이터 메모이제이션
const monthlyData = useMemo(() => prepareMonthlyInvestmentSummary(investments), [investments]);

// 차트 데이터 슬라이싱 메모이제이션 (nextjs.instructions.md 규칙)
const chartData = useMemo(
  () => prepareStackedAreaChartData(investments, timeRange),
  [investments, timeRange]
);
```

### 2. 조건부 렌더링

```typescript
// 계좌가 없을 때 차트 숨김
{investments.length > 0 && (
  <InvestmentStackedAreaChart investments={investments} />
)}

// 빈 상태 Early Return
if (investments.length === 0) {
  return <EmptyState />;
}
```

### 3. Zustand Partialize

```typescript
// UI 상태는 localStorage에 저장 안 함
partialize: (state) => ({
  investments: state.investments,
  customOwners: state.customOwners,
  lastInvestmentId: state.lastInvestmentId,
  // expandedFormId는 제외 (UI 전용, 휘발성)
});
```

### 4. 객체/배열 리터럴 방지

```typescript
// ❌ 나쁜 예: 매 렌더링마다 새 배열 생성
<Component data={investments.filter(inv => inv.currentValue > 0)} />

// ✅ 좋은 예: useMemo로 메모이제이션
const activeInvestments = useMemo(
  () => investments.filter(inv => inv.currentValue > 0),
  [investments]
);
<Component data={activeInvestments} />
```

---

## 향후 개선 사항

### 기능 추가

- [ ] CSV/Excel 데이터 가져오기/내보내기
- [ ] 차트 스크린샷 기능
- [ ] 목표 수익률 설정 및 알림
- [ ] 배당금 추적
- [ ] 세금 계산 기능

### 성능 개선

- [ ] 대량 데이터 처리 시 가상화 (Virtualization)
- [ ] Chart 데이터 캐싱
- [ ] Web Worker를 통한 계산 오프로드

### UX 개선

- [ ] 계좌 검색 기능
- [ ] 태그 기능
- [ ] 즐겨찾기
- [ ] 다크모드 차트 색상 최적화

---

## 참고 자료

### 외부 라이브러리

- [Next.js App Router](https://nextjs.org/docs/app)
- [Zustand Documentation](https://docs.pmnd.rs/zustand)
- [Recharts Documentation](https://recharts.org/)
- [shadcn/ui Components](https://ui.shadcn.com/)
- [Vitest Documentation](https://vitest.dev/)
- [Tailwind CSS](https://tailwindcss.com/)

### 프로젝트 내부 문서

- **테스트 가이드**: `/docs/INVESTMENT_TESTS.md` - 테스트 전략 및 실행 방법
- **개발 가이드**: `/.github/instructions/nextjs.instructions.md` - Next.js 개발 규칙
- **Copilot 지침**: `/.github/copilot-instructions.md` - 프로젝트 전반 규칙

### 관련 모듈

- **Asset Plan**: 투자 계획 vs 실제 성과 비교 모듈
- **Drag & Drop**: `/docs/DRAG_AND_DROP.md` - dnd-kit 사용 가이드
