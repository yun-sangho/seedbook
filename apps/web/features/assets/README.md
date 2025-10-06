# Assets Module (자산 기록)

자산의 시간에 따른 변화를 추적하고 시각화하는 기능입니다.

## 📁 구조

```
features/assets/
├── types/
│   └── progress.ts                # AssetProgressPoint, AssetProgressView 타입
├── stores/
│   ├── progress-store.ts          # Progress Zustand store
│   └── progress-store.test.ts     # Store 테스트
├── utils/
│   ├── progress-utils.ts          # Progress 계산 유틸리티
│   ├── progress-utils.test.ts     # Utils 테스트
│   ├── auto-progress-tracker.ts   # 자동 추적 유틸리티
│   └── auto-progress-tracker.test.ts # 자동 추적 테스트
└── index.ts                        # Export barrel

app/assets/progress/
├── page.tsx                        # Progress 페이지
└── _components/
    ├── progress-data-table.tsx     # TanStack Table 컴포넌트
    ├── columns.tsx                 # Table 컬럼 정의
    └── add-progress-point-dialog.tsx # 수동 기록 추가 Dialog

components/
└── auto-progress-tracker.tsx       # 자동 추적 초기화 컴포넌트
```

## 🎯 주요 기능

### 1. Progress Store
- **독립적인 데이터 저장**: 자산 변경사항을 독립적으로 저장
- **자동 병합**: 같은 날짜의 업데이트를 자동으로 병합
- **날짜순 정렬**: 항상 시간순으로 정렬된 데이터 유지
- **Persist**: LocalStorage에 자동 저장

### 2. 자동 Progress Tracking ⭐ NEW
- **Store 간 분리**: 각 store는 서로를 직접 참조하지 않음 (느슨한 결합)
- **Subscribe 패턴**: Zustand의 subscribe API를 활용하여 변화 감지
- **Debounce 적용**: 500ms 내 여러 변경사항을 하나의 point로 병합
- **자동 생성**: 투자/저축/실물자산/대출 금액이 변할 때마다 자동으로 progress point 생성
- **실시간 반영**: 같은 날짜의 point는 자동으로 최신 값으로 업데이트

### 3. 수동 Progress Point 추가
- **현재 값 자동 입력**: 각 자산의 현재 총액이 기본값으로 입력
- **커스텀 값 입력**: 사용자가 원하는 값으로 수정 가능
- **실시간 계산**: 총자산과 순자산이 실시간으로 계산되어 표시

### 4. Progress Points 생성
- **누적 계산**: 각 날짜에 모든 자산의 최신 값을 반영
- **날짜 유효성 검사**: 유효하지 않은 날짜 자동 필터링
- **다중 자산 타입**: 투자, 저축, 실물자산, 대출 모두 지원

### 5. 데이터 시각화
- **3가지 뷰**: 자산 총액, 순자산, 부채
- **Line Chart**: 시간에 따른 추이 시각화
- **TanStack DataTable**: 
  - 정렬 기능 (모든 컬럼)
  - 페이지네이션 (10개씩)
  - 빈 상태 처리
  - 한국어 날짜/금액 포맷팅

## 💾 Store API

```typescript
interface ProgressState {
  progressPoints: AssetProgressPoint[];
  
  // Progress point 추가 (같은 날짜는 병합)
  addProgressPoint: (point: AssetProgressPoint) => void;
  
  // Progress point 업데이트
  updateProgressPoint: (date: string, point: Partial<AssetProgressPoint>) => void;
  
  // Progress point 삭제
  deleteProgressPoint: (date: string) => void;
  
  // 여러 points 한번에 설정
  setProgressPoints: (points: AssetProgressPoint[]) => void;
  
  // 모든 points 삭제
  clearProgressPoints: () => void;
}
```

## 🔄 사용 예제

### 자동 Progress Tracking 초기화 (권장 ⭐)

앱 최상위에서 한 번만 호출하면 자동으로 모든 자산 변화를 추적합니다:

```typescript
// app/layout.tsx 또는 최상위 컴포넌트
import { AutoProgressTracker } from "@web/components/auto-progress-tracker";

export default function RootLayout({ children }) {
  return (
    <ThemeProvider>
      <AutoProgressTracker />  {/* 자동 추적 시작 */}
      {children}
    </ThemeProvider>
  );
}
```

이제 투자/저축/실물자산/대출을 추가하거나 수정할 때마다 자동으로 progress point가 생성됩니다!

### 수동으로 Progress Point 추가

```typescript
import { useProgressStore } from "@web/features/assets";

function MyComponent() {
  const addProgressPoint = useProgressStore((state) => state.addProgressPoint);
  
  const handleAddCustomPoint = () => {
    addProgressPoint({
      date: "2025-10-06",
      investments: 100000,
      savings: 50000,
      realAssets: 200000,
      loans: 30000,
      totalAssets: 350000,  // investments + savings + realAssets
      netAssets: 320000,    // totalAssets - loans
    });
  };
}
```

### Progress Points 생성 (수동)

```typescript
import { generateCumulativeProgressPoints } from "@web/features/assets";

const progressPoints = generateCumulativeProgressPoints(
  investments,
  savings,
  realAssets,
  loans
);
```

## 📊 AssetProgressPoint 구조

```typescript
interface AssetProgressPoint {
  date: string;              // YYYY-MM-DD 형식
  totalAssets: number;       // 총 자산 (투자 + 저축 + 실물자산)
  netAssets: number;         // 순자산 (총 자산 - 부채)
  investments: number;       // 투자 총액
  savings: number;           // 저축 총액
  realAssets: number;        // 실물자산 총액
  loans: number;             // 부채 총액
}
```

## 🧪 테스트

모든 기능에 대한 테스트가 작성되어 있습니다:

```bash
# Progress utils 테스트 (5개)
npx vitest run features/assets/utils/progress-utils.test.ts

# Progress store 테스트 (7개)
npx vitest run features/assets/stores/progress-store.test.ts

# 자동 추적 테스트 (8개) ⭐ NEW
npx vitest run features/assets/utils/auto-progress-tracker.test.ts
```

### 테스트 커버리지
- ✅ Progress points 생성
- ✅ 여러 자산 타입 병합
- ✅ 순자산 계산
- ✅ 누적 값 계산
- ✅ 유효하지 않은 날짜 필터링
- ✅ Store CRUD 작업
- ✅ 날짜순 정렬
- ✅ 같은 날짜 병합
- ✅ **자동 추적 - 투자 변경 감지** ⭐
- ✅ **자동 추적 - 저축 변경 감지** ⭐
- ✅ **자동 추적 - 실물자산 변경 감지** ⭐
- ✅ **자동 추적 - 대출 변경 감지** ⭐
- ✅ **자동 추적 - Debounce 동작** ⭐
- ✅ **자동 추적 - 같은 날짜 병합** ⭐
- ✅ **자동 추적 - Cleanup (구독 해제)** ⭐
- ✅ **자동 추적 - 총액 변화 없을 때 생성 안함** ⭐
- ✅ 순자산 계산
- ✅ 누적 값 계산
- ✅ 유효하지 않은 날짜 필터링
- ✅ Store CRUD 작업
- ✅ 날짜순 정렬
- ✅ 같은 날짜 병합

## 🔍 날짜 유효성 검사

Invalid Date 문제를 방지하기 위해 모든 날짜는 자동으로 검증됩니다:

```typescript
function isValidDate(dateString: string | undefined | null): boolean {
  if (!dateString || dateString.trim() === "") {
    return false;
  }
  const date = new Date(dateString);
  return !isNaN(date.getTime());
}
```

유효하지 않은 날짜는 자동으로 무시되어 안전하게 처리됩니다.

## 🚀 페이지 사용

`/assets/progress` 페이지에서:
1. **자산 기록 추가** 버튼으로 수동 기록 추가 (현재 총액 자동 입력)
2. Select로 뷰 선택 (자산 총액/순자산/부채)
3. 통계 카드에서 현재/시작/변화량/변화율 확인
4. Line Chart로 추이 시각화
5. DataTable로 상세 내역 확인:
   - 컬럼 헤더 클릭으로 정렬
   - 페이지네이션으로 10개씩 표시
   - 최신 날짜부터 역순 정렬

자산(투자/저축/실물자산/대출)이 변경되면 **자동으로** Progress Points가 생성되어 업데이트됩니다! ⚡

## 📊 DataTable 기능

### 컬럼 구성
- **날짜**: 정렬 가능, 한국어 포맷 (예: 2024. 1. 1.)
- **투자**: 정렬 가능, 만원 단위 표시
- **저축**: 정렬 가능, 만원 단위 표시
- **실물자산**: 정렬 가능, 만원 단위 표시
- **부채**: 정렬 가능, 빨간색 표시
- **자산 총액**: 정렬 가능, 굵은 글씨
- **순자산**: 정렬 가능, 굵은 글씨

### 사용자 인터랙션
- 각 컬럼 헤더의 ↕ 아이콘 클릭으로 오름차순/내림차순 정렬
- 하단 페이지네이션으로 이전/다음 페이지 이동
- 현재 표시 범위 확인 (예: 1-10 / 25)

