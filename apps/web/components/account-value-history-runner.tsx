"use client";

import { useEffect } from "react";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { projectHoldings } from "@web/features/investments/utils/account-value-history";
import {
  fillMissingSnapshots,
  recordHoldings,
} from "@web/features/investments/utils/account-value-history-storage";
import { getStorageMode } from "@web/lib/storage-mode";

/** 보유 수량을 입력하는 동안 매번 쓰지 않도록, 마지막 변경 뒤 이만큼 기다렸다 기록한다. */
const RECORD_DELAY_MS = 1_000;

/**
 * local 모드의 계좌 총액 일별 기록 (`features/investments/utils/account-value-history*.ts`).
 *
 *   - 보유 종목·현금이 바뀌면 그 보유 내역을 기기 이력에 남긴다.
 *   - 앱을 열 때와 다시 볼 때(백그라운드에서 돌아올 때) 빠진 평일을 채운다.
 *
 * cloud 모드는 서버가 기록하므로 "기록 중단" 만 남긴다 — 나중에 local 로 돌아와도 cloud 로 있던
 * 기간을 옛 보유 내역으로 채우지 않는다. store 가 하이드레이션된 뒤(`HydrationGate` 안)에 그린다.
 */
export function AccountValueHistoryRunner() {
  useEffect(() => {
    if (getStorageMode() !== "local") {
      void recordHoldings(null).catch(warn);
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    const record = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      return recordHoldings(projectHoldings(useInvestmentStore.getState().investments));
    };
    const recordAndFill = () =>
      void record()
        .then(() => fillMissingSnapshots())
        .catch(warn);

    recordAndFill();

    const unsubscribe = useInvestmentStore.subscribe((state, previous) => {
      if (state.investments === previous.investments) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void record().catch(warn), RECORD_DELAY_MS);
    });
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") recordAndFill();
      // 앱이 백그라운드로 가면 곧 멈출 수 있다 — 기다리던 기록을 바로 남긴다.
      else if (timer) void record().catch(warn);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (timer) void record().catch(warn);
    };
  }, []);

  return null;
}

function warn(error: unknown) {
  console.warn("[seedbook] account value history", error);
}
