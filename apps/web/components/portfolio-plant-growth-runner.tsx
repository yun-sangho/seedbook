"use client";

import { usePortfolioPlants } from "@web/features/portfolio/utils/use-portfolio-plants";

/**
 * 앱을 쓰는 동안 목표를 달성한 포트폴리오 식물을 키운다 (`usePortfolioPlants`). 정원 화면이 없어도
 * 단계가 쌓이도록 앱 전체에 하나 둔다. store 가 하이드레이션된 뒤에 그린다.
 */
export function PortfolioPlantGrowthRunner() {
  usePortfolioPlants();
  return null;
}
