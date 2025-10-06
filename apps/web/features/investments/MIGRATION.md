# TimeRange 및 관련 유틸리티 이동

## 📋 변경 사항

### 이동된 파일 및 함수

#### ✅ **TimeRange Enum**

- **이전 위치**: `/utils/investment-chart-utils.ts`
- **새 위치**: `/features/investments/types/constants.ts`
- **이유**: Investment feature의 타입/상수로 더 명확하게 분류

#### ✅ **getTimeRangeLabel 함수**

- **이전 위치**: `/utils/investment-chart-utils.ts`
- **새 위치**: `/features/investments/utils/time-range-utils.ts`
- **이유**: 독립적인 유틸리티 파일로 분리하여 유지보수성 향상

### 📦 Export 구조

#### 새로운 통합 Export (`/features/investments/index.ts`)

```typescript
// Types & Constants
export { TimeRange } from "./types/constants";

// Utils
export { getTimeRangeLabel } from "./utils/time-range-utils";
export { prepareStackedAreaChartData } from "./utils/investments-stacked-area-chart-utils";
export type { AccountChartData } from "./utils/investments-stacked-area-chart-utils";
```

#### 하위 호환성 유지 (`/utils/investment-chart-utils.ts`)

```typescript
// @deprecated - Re-export for backward compatibility
export { TimeRange } from "@web/features/investments/types/constants";
export { getTimeRangeLabel } from "@web/features/investments/utils/time-range-utils";
```

### 🔄 업데이트된 Import 경로

#### Before ❌

```typescript
import { TimeRange, getTimeRangeLabel } from "@web/utils/investment-chart-utils";
```

#### After ✅

```typescript
import { TimeRange, getTimeRangeLabel } from "@web/features/investments";
```

### 📁 영향받은 파일들

1. ✅ `/app/assets/investments/_components/investment-stacked-area-chart.tsx`
2. ✅ `/app/assets/savings/_components/savings-stacked-area-chart.tsx`
3. ✅ `/features/investments/utils/investments-stacked-area-chart-utils.ts`
4. ✅ `/features/investments/utils/investments-stacked-area-chart-utils.test.ts`
5. ✅ `/features/savings/utils/savings-stacked-area-chart-utils.ts`
6. ✅ `/features/savings/utils/savings-stacked-area-chart-utils.test.ts`

### ✅ 테스트 결과

**모든 테스트 통과**: 166개 테스트 ✅

```
 Test Files  13 passed (13)
      Tests  166 passed (166)
```

### 📚 새로운 파일 구조

```
features/investments/
├── types/
│   └── constants.ts              # TimeRange enum 추가
├── utils/
│   ├── time-range-utils.ts       # getTimeRangeLabel 함수 (새 파일)
│   └── investments-stacked-area-chart-utils.ts
└── index.ts                       # 통합 export (새 파일)

utils/
└── investment-chart-utils.ts     # @deprecated (re-export만 유지)
```

### 🎯 장점

1. **명확한 소속**: TimeRange가 investment feature의 일부임이 명확
2. **재사용성**: 다른 feature에서도 `@web/features/investments`로 import 가능
3. **유지보수성**: 관련 코드가 한 곳에 모여 있음
4. **하위 호환성**: 기존 코드도 여전히 작동 (deprecated warning만 표시)
5. **타입 안전성**: 모든 타입 체크 통과

### 🚀 다음 단계 (선택사항)

1. 다른 feature들도 동일한 패턴으로 정리
2. 향후 major version에서 `/utils/investment-chart-utils.ts` 완전 제거
3. 공통 타입이 필요하면 `/types` 디렉토리 생성 고려
