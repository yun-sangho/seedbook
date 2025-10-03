# 드래그 앤 드롭 정렬 기능 (Drag & Drop Reordering)

## 개요

모든 자산 리스트(투자, 대출, 실물자산, 저축)에 드래그 앤 드롭 정렬 기능이 추가되었습니다.
모바일과 데스크톱 환경 모두에서 직관적으로 사용할 수 있도록 설계되었습니다.

## 주요 특징

### 1. 크로스 플랫폼 지원

- **데스크톱**: 마우스 드래그로 아이템 이동
- **모바일**: 터치 드래그로 아이템 이동
- 8px 이상 드래그 시 정렬 모드 활성화 (클릭과 구분)
- 모바일에서는 200ms 롱프레스 후 드래그 시작

### 2. 시각적 피드백

- **드래그 핸들**: 왼쪽에 ≡ (GripVertical) 아이콘 표시
  - 데스크톱: 호버 시 나타남
  - 모바일: 항상 표시
- **드래그 중**: 반투명 오버레이로 현재 드래그 중인 아이템 표시
- **애니메이션**: 부드러운 정렬 애니메이션

### 3. 접근성

- 키보드 네비게이션 지원 (기본 제공)
- ARIA 레이블 적용
- 스크린 리더 호환

## 사용 방법

### 데스크톱

1. 아이템에 마우스를 호버하면 왼쪽에 ≡ 아이콘이 나타남
2. ≡ 아이콘을 클릭하고 드래그
3. 원하는 위치에 드롭

### 모바일

1. 왼쪽의 ≡ 아이콘을 길게 누름 (200ms)
2. 드래그하여 원하는 위치로 이동
3. 손가락을 떼면 해당 위치에 고정

## 기술 스택

### 라이브러리

- **@dnd-kit/core**: 드래그 앤 드롭 핵심 기능
- **@dnd-kit/sortable**: 리스트 정렬 기능
- **@dnd-kit/utilities**: CSS 변환 유틸리티

### 주요 컴포넌트

#### `SortableList<T>`

재사용 가능한 정렬 리스트 래퍼 컴포넌트

```tsx
<SortableList
  items={investments}
  onReorder={(reordered) => reorderInvestments(reordered)}
  getItemId={(item) => item.id}
  renderDragOverlay={(activeId) => {
    const item = investments.find((inv) => inv.id === activeId);
    return <div>{item?.accountName}</div>;
  }}
>
  {children}
</SortableList>
```

**Props:**

- `items`: 정렬할 아이템 배열
- `onReorder`: 순서 변경 시 호출되는 콜백
- `getItemId`: 각 아이템의 고유 ID 추출 함수
- `renderDragOverlay`: (선택) 드래그 중 표시할 커스텀 오버레이

#### `SortableItem`

정렬 가능한 개별 아이템 래퍼

```tsx
<SortableItem id={item.id} showHandle={true}>
  <YourItemComponent item={item} />
</SortableItem>
```

**Props:**

- `id`: 아이템 고유 ID
- `showHandle`: 드래그 핸들 표시 여부 (기본: true)
- `className`: 추가 CSS 클래스

## 구현된 페이지

### 1. 투자 (Investments)

- 파일: `apps/web/app/assets/investments/_components/investment-form.tsx`
- 스토어: `reorderInvestments(reorderedInvestments: InvestmentItem[])`

### 2. 대출 (Loans)

- 파일: `apps/web/app/assets/loans/page.tsx`
- 스토어: `reorderLoans(reorderedLoans: LoanItem[])`

### 3. 실물자산 (Real Assets)

- 파일: `apps/web/app/assets/real-assets/page.tsx`
- 스토어: `reorderRealAssets(reorderedAssets: RealAssetItem[])`

### 4. 저축 (Savings)

- 파일: `apps/web/app/assets/savings/_components/savings-form.tsx`
- 스토어: `reorderSavings(reorderedSavings: SavingsItem[])`

## 스토어 변경사항

각 Zustand 스토어에 재정렬 액션 추가:

```typescript
interface StoreState {
  // ... 기존 상태
  reorderItems: (reorderedItems: ItemType[]) => void;
}

// 구현
reorderItems: (reorderedItems) => {
  set({ items: reorderedItems });
};
```

## 데이터 지속성

- 모든 순서 변경은 Zustand persist 미들웨어를 통해 **localStorage에 자동 저장**
- 페이지 새로고침 시에도 순서 유지
- 스토리지 키:
  - `investment-storage`
  - `loans-storage`
  - `real-assets-storage`
  - `savings-storage`

## 성능 고려사항

### 최적화

- 센서 활성화 임계값으로 불필요한 드래그 방지
- CSS Transform 사용으로 리플로우 최소화
- 메모이제이션으로 불필요한 리렌더링 방지

### 터치 최적화

- `touchAction: 'none'` CSS로 브라우저 기본 터치 동작 비활성화
- Passive event listener 비활성화로 preventDefault 가능

## UI/UX 가이드라인

### 드래그 핸들 가시성

- **데스크톱**: 호버 시에만 표시 (깔끔한 UI)
- **모바일**: 항상 표시 (터치 타겟 명확화)

### 드래그 중 상태

- 원본 아이템: 50% 투명도
- 오버레이: 90% 투명도, 그림자 효과
- z-index 자동 조정

### 애니메이션

- 부드러운 전환 효과 (CSS transition)
- 드래그 중 즉각적인 피드백

## 향후 개선 방향

### 단기

- [ ] 드래그 중 햅틱 피드back (모바일)
- [ ] 다중 선택 드래그
- [ ] 정렬 취소 기능 (Undo)

### 중기

- [ ] 카테고리 간 드래그 앤 드롭
- [ ] 그리드 레이아웃 지원
- [ ] 드래그 제한 영역 설정

### 장기

- [ ] 서버 동기화 (optimistic update)
- [ ] 충돌 해결 메커니즘
- [ ] 정렬 히스토리 추적

## 문제 해결

### 드래그가 작동하지 않을 때

1. 브라우저 콘솔에서 에러 확인
2. `@dnd-kit` 패키지 설치 확인: `pnpm list @dnd-kit/core`
3. CSS `touch-action` 속성 확인

### 모바일에서 스크롤과 충돌

- 200ms 롱프레스로 스크롤과 구분됨
- `activationConstraint.tolerance: 5px` 설정으로 미세한 움직임 허용

### 순서가 저장되지 않을 때

- localStorage 확인: 개발자 도구 > Application > Local Storage
- persist 미들웨어 설정 확인
- 스토어 액션 호출 확인

## 참고 자료

- [@dnd-kit 공식 문서](https://docs.dndkit.com/)
- [Sortable 예제](https://docs.dndkit.com/presets/sortable)
- [터치 센서 설정](https://docs.dndkit.com/api-documentation/sensors/touch)
