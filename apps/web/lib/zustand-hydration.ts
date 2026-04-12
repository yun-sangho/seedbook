"use client";

import { useEffect, useState } from "react";
import { useAssetPlanStore } from "@web/features/asset-plan/stores/asset-plan-store";
import { useProgressStore } from "@web/features/assets/stores/progress-store";
import { useDebtsStore } from "@web/features/debts/stores/debts-store";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { useRealAssetsStore } from "@web/features/real-assets/stores/real-assets-store";
import { useSavingsStore } from "@web/features/savings/stores/savings-store";

/**
 * Zustand `persist` 미들웨어가 부착한 최소 API.
 *
 * 각 store 의 `useXxxStore` 는 `persist` 네임스페이스를 노출하며
 * 그 안에 `hasHydrated` / `onFinishHydration` 이 존재한다.
 */
type PersistedStore = {
  persist: {
    hasHydrated: () => boolean;
    onFinishHydration: (fn: () => void) => () => void;
  };
};

/**
 * 하나의 persist store 가 이미 localStorage(또는 다른 storage backend) 로부터
 * 하이드레이션을 완료했는지 구독한다. 완료 전이면 false, 완료 후에는 true.
 *
 * 서버 렌더링과 클라이언트의 첫 렌더를 일치시키기 위해 항상 `false` 로 시작한
 * 뒤, `useEffect` 안에서 동기화한다. 결과적으로 (SSR markup = loading) →
 * (client first render = loading) → (next paint = children) 순으로 흐르며
 * React hydration mismatch 가 발생하지 않는다.
 */
export function useStoreHydrated(store: PersistedStore): boolean {
  const [hydrated, setHydrated] = useState<boolean>(false);

  useEffect(() => {
    // 이미 하이드레이션이 끝난 상태면 즉시 반영 (sync storage 일 때 흔함)
    if (store.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    const unsub = store.persist.onFinishHydration(() => setHydrated(true));
    return unsub;
  }, [store]);

  return hydrated;
}

/**
 * 6 개 주요 persist store 가 모두 하이드레이션을 마쳤는지 반환한다.
 *
 * 클라우드 저장(async storage) 까지 포함한 비동기 하이드레이션 경로에서도
 * 개별 컴포넌트가 `length === 0` 같은 동기 전제로 UI 분기를 하지 못하도록
 * 루트에서 한 번에 막는 용도.
 */
export function useAllStoresHydrated(): boolean {
  const invHydrated = useStoreHydrated(useInvestmentStore);
  const savHydrated = useStoreHydrated(useSavingsStore);
  const debHydrated = useStoreHydrated(useDebtsStore);
  const realHydrated = useStoreHydrated(useRealAssetsStore);
  const planHydrated = useStoreHydrated(useAssetPlanStore);
  const progHydrated = useStoreHydrated(useProgressStore);

  return invHydrated && savHydrated && debHydrated && realHydrated && planHydrated && progHydrated;
}
