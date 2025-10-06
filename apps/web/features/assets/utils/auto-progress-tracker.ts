/**
 * 자산 변화 자동 추적 유틸리티
 *
 * 각 store의 총액 변화를 감지하여 자동으로 progress point를 생성합니다.
 * Store 간 직접 의존성 없이 subscribe 패턴을 활용하여 느슨하게 결합됩니다.
 */

import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { useLoansStore } from "@web/features/loans/stores/loans-store";
import { useRealAssetsStore } from "@web/features/real-assets/stores/real-assets-store";
import { useSavingsStore } from "@web/features/savings/stores/savings-store";
import { useProgressStore } from "../stores/progress-store";

/**
 * 투자 총액 계산
 */
const calculateInvestmentTotal = (state: ReturnType<typeof useInvestmentStore.getState>) => {
  return state.investments.reduce((sum, inv) => sum + (inv.currentValue || 0), 0);
};

/**
 * 저축 총액 계산
 */
const calculateSavingsTotal = (state: ReturnType<typeof useSavingsStore.getState>) => {
  return state.savings.reduce((sum, sav) => sum + (sav.balance || 0), 0);
};

/**
 * 실물자산 총액 계산
 */
const calculateRealAssetsTotal = (state: ReturnType<typeof useRealAssetsStore.getState>) => {
  return state.realAssets.reduce((sum, asset) => sum + (asset.currentValue || 0), 0);
};

/**
 * 대출 총액 계산
 */
const calculateLoansTotal = (state: ReturnType<typeof useLoansStore.getState>) => {
  return state.loans.reduce((sum, loan) => sum + (loan.amount || 0), 0);
};

/**
 * 자동 진행 상황 추적 시작
 *
 * 각 store의 변화를 구독하여 총액이 변경될 때마다 progress point를 생성합니다.
 * 짧은 시간 내 여러 변경사항은 debounce를 통해 하나로 묶입니다.
 *
 * @returns cleanup 함수 - 컴포넌트 unmount 시 호출하여 구독 해제
 *
 * @example
 * ```tsx
 * useEffect(() => {
 *   const cleanup = startAutoProgressTracking();
 *   return cleanup;
 * }, []);
 * ```
 */
export const startAutoProgressTracking = () => {
  // 이전 총액을 추적하여 실제 변화가 있을 때만 반응
  const previousTotals = {
    investments: 0,
    savings: 0,
    realAssets: 0,
    loans: 0,
  };

  // 초기값 설정
  previousTotals.investments = calculateInvestmentTotal(useInvestmentStore.getState());
  previousTotals.savings = calculateSavingsTotal(useSavingsStore.getState());
  previousTotals.realAssets = calculateRealAssetsTotal(useRealAssetsStore.getState());
  previousTotals.loans = calculateLoansTotal(useLoansStore.getState());

  // Debounce를 위한 타이머
  let timeoutId: NodeJS.Timeout | null = null;

  /**
   * Progress Point 생성 함수
   * 여러 store 변경을 500ms 동안 묶어서 하나의 point로 저장
   */
  const createProgressPoint = () => {
    // 기존 타이머가 있으면 취소 (debounce)
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      const today = new Date().toISOString().split("T")[0] || "";
      const totalAssets =
        previousTotals.investments + previousTotals.savings + previousTotals.realAssets;
      const netAssets = totalAssets - previousTotals.loans;

      // progress-store의 addProgressPoint가 같은 날짜 병합을 자동 처리
      useProgressStore.getState().addProgressPoint({
        date: today,
        investments: previousTotals.investments,
        savings: previousTotals.savings,
        realAssets: previousTotals.realAssets,
        loans: previousTotals.loans,
        totalAssets,
        netAssets,
      });

      timeoutId = null;
    }, 500);
  };

  // 투자 store 구독
  const unsubscribeInvestment = useInvestmentStore.subscribe((state) => {
    const newTotal = calculateInvestmentTotal(state);
    if (newTotal !== previousTotals.investments) {
      previousTotals.investments = newTotal;
      createProgressPoint();
    }
  });

  // 저축 store 구독
  const unsubscribeSavings = useSavingsStore.subscribe((state) => {
    const newTotal = calculateSavingsTotal(state);
    if (newTotal !== previousTotals.savings) {
      previousTotals.savings = newTotal;
      createProgressPoint();
    }
  });

  // 실물자산 store 구독
  const unsubscribeRealAssets = useRealAssetsStore.subscribe((state) => {
    const newTotal = calculateRealAssetsTotal(state);
    if (newTotal !== previousTotals.realAssets) {
      previousTotals.realAssets = newTotal;
      createProgressPoint();
    }
  });

  // 대출 store 구독
  const unsubscribeLoans = useLoansStore.subscribe((state) => {
    const newTotal = calculateLoansTotal(state);
    if (newTotal !== previousTotals.loans) {
      previousTotals.loans = newTotal;
      createProgressPoint();
    }
  });

  // cleanup 함수 반환
  return () => {
    unsubscribeInvestment();
    unsubscribeSavings();
    unsubscribeRealAssets();
    unsubscribeLoans();

    // pending된 debounce 타이머도 정리
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  };
};
