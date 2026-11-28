import { PlantAvatar } from "@mobile/features/garden/components/plant-avatar";
import { RebalanceMark } from "@mobile/features/garden/components/rebalance-mark";
import { PLANT_STAGES } from "@mobile/features/garden/plant-3d/plant-options";
import { plantKindOf, potForPortfolio } from "@mobile/features/garden/utils/garden-home";
import type { PortfolioItem } from "../types/types";

/** 아바타 크기 대비 `!` 배지 크기 (정원 목록: 44px 아바타 → 16px 배지). */
const BADGE_RATIO = 16 / 44;

/** 2D 식물을 그리는 데 필요한 포트폴리오 값. */
export type PortfolioPlantLook = Pick<
  PortfolioItem,
  "id" | "growthStage" | "goalAmount" | "plantKind" | "fruitGoal"
>;

/**
 * 포트폴리오를 나타내는 2D 식물. 정원과 같은 규칙(단계, `potForPortfolio` 화분 색, `plantKindOf`
 * 나무·고사리, 열매)이라 같은 포트폴리오는 어디서나 같은 모습이다. `needsRebalance` 면 정원처럼 오른쪽
 * 위에 작은 원형 `!`.
 */
export function PortfolioPlantAvatar({
  portfolio,
  size,
  needsRebalance = false,
  rain = 0,
}: {
  portfolio: PortfolioPlantLook;
  size: number;
  needsRebalance?: boolean;
  /** 비 (시장 하락, `plantRain`). 식물 상태를 아는 화면만 넘긴다. */
  rain?: number;
}) {
  return (
    <span className="relative inline-flex shrink-0 align-middle">
      <PlantAvatar
        stage={PLANT_STAGES[portfolio.growthStage]}
        pot={potForPortfolio(portfolio.id)}
        kind={plantKindOf(portfolio)}
        ripe={portfolio.fruitGoal !== null}
        empty={portfolio.growthStage === 0 && portfolio.goalAmount === null}
        rain={rain}
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
