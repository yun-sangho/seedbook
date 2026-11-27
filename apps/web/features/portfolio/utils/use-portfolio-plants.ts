"use client";

import { useEffect, useMemo } from "react";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { useStockPrices } from "@web/features/investments/utils/use-stock-prices";
import { usePortfolioStore } from "../stores/portfolio-store";
import { type PortfolioPlantView, portfolioPlantView } from "./portfolio-plant-view";

/**
 * 포트폴리오마다 식물 (단계·처짐·남은 금액·리밸런싱 필요 여부). 목표를 달성한 식물은 저장된 단계를
 * 올린다 — local·cloud 모두 store 에 쓰고, cloud 는 엔티티 동기화가 다른 기기에 전한다.
 *
 * 만료된 시세를 새로 받는 중에는 키우지 않는다 (옛 시세로 잘못 자라지 않게).
 */
export function usePortfolioPlants(): PortfolioPlantView[] {
  const investments = useInvestmentStore((s) => s.investments);
  const portfolios = usePortfolioStore((s) => s.portfolios);
  const growPlants = usePortfolioStore((s) => s.growPlants);
  const allHoldings = useMemo(
    () => investments.flatMap((inv) => inv.holdings ?? []),
    [investments]
  );
  const { prices, isFetching } = useStockPrices(allHoldings);

  const plants = useMemo(
    () => portfolios.map((p) => portfolioPlantView(p, investments, prices)),
    [portfolios, investments, prices]
  );

  useEffect(() => {
    if (isFetching) return;
    const grown = plants.filter((plant) => plant.grew);
    if (grown.length === 0) return;
    growPlants(new Map(grown.map((plant) => [plant.portfolioId, plant.value])));
  }, [plants, isFetching, growPlants]);

  return plants;
}
