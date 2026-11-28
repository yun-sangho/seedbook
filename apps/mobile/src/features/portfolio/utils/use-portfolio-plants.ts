"use client";

import { useEffect, useMemo, useState } from "react";
import { useInvestmentStore } from "@mobile/features/investments/stores/investment-store";
import { useStockPrices } from "@mobile/features/investments/utils/use-stock-prices";
import { usePortfolioStore } from "../stores/portfolio-store";
import { type PortfolioPlantView, portfolioPlantView } from "./portfolio-plant-view";

/** 이탈 기간(일)을 다시 재는 간격 — 앱을 켜 둔 채 날이 바뀌어도 시듦이 따라간다. */
const CLOCK_TICK_MS = 60 * 60 * 1000;

/** 지금 시각 (ISO). 한 시간마다 바뀐다 — 식물 평가(이탈 기간)에 쓴다. */
export function useHourlyNow(): string {
  const [now, setNow] = useState(() => new Date().toISOString());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date().toISOString()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/**
 * 포트폴리오마다 식물 (단계·목표 상태·시듦·바람·리밸런싱 필요 여부). 그리기만 한다 — 저장(자람·이탈
 * 시작일)은 `usePortfolioPlants` (앱 전체에 하나, `PortfolioPlantGrowthRunner`).
 */
export function usePortfolioPlantViews(): { plants: PortfolioPlantView[]; isFetching: boolean } {
  const investments = useInvestmentStore((s) => s.investments);
  const portfolios = usePortfolioStore((s) => s.portfolios);
  const allHoldings = useMemo(
    () => investments.flatMap((inv) => inv.holdings ?? []),
    [investments]
  );
  const { prices, isFetching } = useStockPrices(allHoldings);
  const now = useHourlyNow();

  const plants = useMemo(
    () => portfolios.map((p) => portfolioPlantView(p, investments, prices, now)),
    [portfolios, investments, prices, now]
  );
  return { plants, isFetching };
}

/**
 * `usePortfolioPlantViews` + 평가로 바뀐 식물(목표를 이뤄 자람, 이탈 시작·회복)을 저장한다 — local·cloud
 * 모두 store 에 쓰고, cloud 는 레코드 동기화가 다른 기기에 전한다.
 *
 * 만료된 시세를 새로 받는 중에는 저장하지 않는다 (옛 시세로 잘못 자라거나 시들지 않게).
 */
export function usePortfolioPlants(): PortfolioPlantView[] {
  const { plants, isFetching } = usePortfolioPlantViews();
  const evaluatePlants = usePortfolioStore((s) => s.evaluatePlants);

  useEffect(() => {
    if (isFetching) return;
    const changed = plants.filter((plant) => plant.changed);
    if (changed.length === 0) return;
    evaluatePlants(
      new Map(
        changed.map((plant) => [
          plant.portfolioId,
          { value: plant.value, pricesComplete: plant.pricesComplete, drifting: plant.drifting },
        ])
      )
    );
  }, [plants, isFetching, evaluatePlants]);

  return plants;
}
