import { PlantAvatar } from "@web/features/garden/components/plant-avatar";
import { RebalanceMark } from "@web/features/garden/components/rebalance-mark";
import { PLANT_STAGES } from "@web/features/garden/plant-3d/plant-options";
import { kindForPortfolio, potForPortfolio } from "@web/features/garden/utils/garden-home";
import type { PlantStage } from "../types/types";

/** 아바타 크기 대비 `!` 배지 크기 (정원 목록: 44px 아바타 → 16px 배지). */
const BADGE_RATIO = 16 / 44;

/**
 * 포트폴리오를 나타내는 2D 식물. 정원과 같은 규칙(단계, `potForPortfolio` 화분 색, `kindForPortfolio`
 * 나무·고사리)이라 같은
 * 포트폴리오는 어디서나 같은 모습이다. `needsRebalance` 면 정원처럼 오른쪽 위에 작은 원형 `!`.
 */
export function PortfolioPlantAvatar({
  portfolioId,
  stage,
  size,
  needsRebalance = false,
}: {
  portfolioId: string;
  stage: PlantStage;
  size: number;
  needsRebalance?: boolean;
}) {
  return (
    <span className="relative inline-flex shrink-0 align-middle">
      <PlantAvatar
        stage={PLANT_STAGES[stage]}
        pot={potForPortfolio(portfolioId)}
        kind={kindForPortfolio(portfolioId)}
        size={size}
      />
      {needsRebalance && (
        <span className="absolute -top-[2px] -right-[2px] flex">
          <RebalanceMark size={Math.round(size * BADGE_RATIO)} />
        </span>
      )}
    </span>
  );
}
