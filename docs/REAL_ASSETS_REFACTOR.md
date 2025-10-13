# Real Assets Router 개편 완료

## 📋 변경 사항

### 1. 기존 구조

- 단일 페이지에 모든 로직 포함 (243 lines)
- form 기반 인터페이스
- 제한적인 UI/UX

### 2. 새로운 구조 (투자/저축 패턴 적용)

#### 📁 파일 구조

```
app/assets/real-assets/
├── page.tsx (간소화됨)
└── _components/
    ├── constants.ts
    ├── real-assets-manager.tsx
    ├── real-asset-item.tsx
    ├── add-real-asset-modal.tsx
    └── real-assets-summary.tsx
```

#### 🔧 주요 컴포넌트

**1. `page.tsx`**

- RealAssetsManager 컴포넌트만 렌더링
- 투자/저축 페이지와 동일한 구조

**2. `real-assets-manager.tsx`**

- 탭 기반 인터페이스 (자산 관리 / 통계)
- 빈 상태 처리 (EmptyState)
- SortableList를 통한 드래그 앤 드롭 정렬
- 모달 기반 자산 추가

**3. `real-asset-item.tsx`**

- 카드 기반 UI
- 접기/펼치기 기능
- 평가손익 자동 계산 및 색상 표시
- AssetValueInput 컴포넌트 활용

**4. `add-real-asset-modal.tsx`**

- 자산 유형 선택 (부동산, 자동차, 귀금속 등)
- 소유자 선택
- 자동 이름 생성 (`{소유자}의 {자산유형}`)

**5. `real-assets-summary.tsx`**

- 전체 요약 (구입 금액, 현재 가치, 평가손익, 수익률)
- 자산 유형별 요약
- 소유자별 요약

**6. `constants.ts`**

- 탭 enum 정의 (ACOUNTS, STATISTICS)

## ✨ 새로운 기능

### UI/UX 개선

1. **탭 기반 인터페이스**: 자산 관리와 통계를 분리
2. **빈 상태 처리**: 자산이 없을 때 친절한 안내 메시지
3. **모달 기반 추가**: 더 나은 사용자 경험
4. **드래그 앤 드롭**: 자산 순서 변경 가능
5. **접기/펼치기**: 상세 정보 토글

### 데이터 시각화

1. **평가손익 자동 계산**: 현재 가치 - 구입 금액
2. **수익률 표시**: 색상으로 손익 구분
3. **자산 유형별 집계**: 통계 탭에서 확인
4. **소유자별 집계**: 통계 탭에서 확인

### 컴포넌트 재사용

- `AssetNameInput`: 자산명 입력
- `AssetValueInput`: 금액 입력 (만원 단위, 한글 변환)
- `SortableList/SortableItem`: 드래그 앤 드롭
- `Card/Badge/Button` 등: 일관된 디자인

## 🎯 일관성 확보

투자/저축 페이지와 동일한 패턴 적용:

- ✅ 탭 기반 인터페이스
- ✅ EmptyState 처리
- ✅ 모달 기반 추가
- ✅ 통계 요약 페이지
- ✅ 드래그 앤 드롭 정렬
- ✅ 접기/펼치기 기능

## 🔄 마이그레이션

기존 데이터는 그대로 호환됩니다:

- Store 구조 변경 없음
- 데이터 모델 변경 없음
- localStorage 키 변경 없음

## 📝 사용 방법

1. **자산 추가**: 우측 상단 "실물자산 추가" 버튼 클릭
2. **자산 관리**: "자산 관리" 탭에서 세부 정보 입력/수정
3. **통계 확인**: "통계" 탭에서 요약 정보 확인
4. **순서 변경**: 드래그 앤 드롭으로 자산 순서 조정
5. **자산 삭제**: 상세 보기에서 삭제 버튼 클릭
