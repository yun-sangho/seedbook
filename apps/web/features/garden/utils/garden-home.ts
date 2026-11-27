import type { InvestmentItem } from "@web/features/investments/types/types";
import type { StockPricePoint } from "@web/features/investments/utils/use-stock-prices";
import type { PortfolioItem } from "@web/features/portfolio/types/types";
import { linkedPortfolioStatus } from "@web/features/portfolio/utils/linked-portfolio-status";
import { lastReachedGoal } from "@web/features/portfolio/utils/portfolio-plant";
import type { PortfolioPlantView } from "@web/features/portfolio/utils/portfolio-plant-view";
import {
  type PortfolioStockRow,
  portfolioStockRows,
} from "@web/features/portfolio/utils/portfolio-stock-rows";
import { resolvePortfolioAccounts } from "@web/features/portfolio/utils/resolve-portfolio-accounts";
import type { RebalancingSession } from "@web/features/rebalancing/types/types";
import { isRebalancingCompleted } from "@web/features/rebalancing/utils/rebalancing-session";
import {
  PLANT_STAGES,
  type PlantOptions,
  POT_COLOR_IDS,
  type PotColor,
} from "../plant-3d/plant-options";

/**
 * 정원 홈의 순수 계산: 포트폴리오 식물 → 3D 옵션·목록 행·포커스 요약, 포커스 상태 전환, 성장 감지,
 * 리밸런싱 배지가 갈 화면.
 */

/** 마지막으로 달성한 목표보다 이만큼(비율) 내려가면 가장 많이 처진다. */
export const FULL_DROOP_DROP = 0.2;

/** 문자열 → 32비트 해시 (FNV-1a). 포트폴리오마다 화분 색·잎 배치를 고정하는 데 쓴다. */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** 포트폴리오의 화분 색. 같은 포트폴리오는 기기·새로고침과 관계없이 같은 색이다. */
export function potForPortfolio(portfolioId: string): PotColor {
  return POT_COLOR_IDS[hashString(portfolioId) % POT_COLOR_IDS.length] ?? "terracotta";
}

/**
 * 처짐 정도 (0~1). 마지막으로 달성한 목표보다 금액이 내려간 비율을 `FULL_DROOP_DROP` 기준으로 편다.
 * 시세가 다 오기 전이나 달성한 목표가 없으면 0.
 */
export function plantDroop(
  value: number,
  lastGoalAmount: number | null,
  pricesComplete: boolean
): number {
  if (!pricesComplete || lastGoalAmount === null || lastGoalAmount <= 0) return 0;
  const drop = (lastGoalAmount - value) / lastGoalAmount;
  if (drop <= 0) return 0;
  return Math.min(1, drop / FULL_DROOP_DROP);
}

/** 3D 식물 옵션. */
export function gardenPlantOptions(
  plant: PortfolioPlantView,
  portfolio: Pick<PortfolioItem, "goalAmount" | "growthStage" | "goalHistory">
): PlantOptions {
  return {
    stage: PLANT_STAGES[plant.stage],
    droop: plantDroop(
      plant.value,
      lastReachedGoal(portfolio)?.amount ?? null,
      plant.pricesComplete
    ),
    needsRebalance: plant.rebalancing === "needs-rebalancing",
    pot: potForPortfolio(plant.portfolioId),
    seed: hashString(plant.portfolioId) % 1000,
  };
}

/** 목표 대비 지금 금액 (%, 소수 버림). 목표가 없으면 null. */
export function goalProgressPercent(value: number, goalAmount: number | null): number | null {
  if (goalAmount === null || goalAmount <= 0) return null;
  return Math.floor((Math.max(0, value) / goalAmount) * 100);
}

/** 정원 목록(포커스 풀림)의 행 하나. */
export interface GardenRow {
  portfolioId: string;
  name: string;
  stage: PortfolioPlantView["stage"];
  pot: PotColor;
  /** 평가 금액 (원). 연결 계좌가 없으면 null — "연결 계좌 없음" 으로 보인다. */
  value: number | null;
  needsRebalance: boolean;
  drooping: boolean;
  /** 목표가 없어 정해야 한다 (씨앗이거나 방금 목표를 달성함). */
  needsGoal: boolean;
}

function gardenRow(plant: PortfolioPlantView, linked: boolean): GardenRow {
  return {
    portfolioId: plant.portfolioId,
    name: plant.name || "이름 없는 포트폴리오",
    stage: plant.stage,
    pot: potForPortfolio(plant.portfolioId),
    value: linked ? plant.value : null,
    needsRebalance: plant.rebalancing === "needs-rebalancing",
    drooping: plant.drooping,
    needsGoal: plant.goalState === "needs-goal",
  };
}

export function gardenRows(
  plants: readonly PortfolioPlantView[],
  portfolios: readonly Pick<PortfolioItem, "id" | "accountIds">[],
  investments: readonly Pick<InvestmentItem, "id">[]
): GardenRow[] {
  const accountIds = new Set(investments.map((inv) => inv.id));
  return plants.map((plant) => {
    const portfolio = portfolios.find((p) => p.id === plant.portfolioId);
    return gardenRow(plant, portfolio?.accountIds.some((id) => accountIds.has(id)) ?? false);
  });
}

/** 포커스한 식물의 요약 + 종목 목록. */
export interface GardenFocusSummary {
  row: GardenRow;
  goalState: PortfolioPlantView["goalState"];
  goalAmount: number | null;
  /** 목표 대비 % (목표가 없으면 null). */
  goalPercent: number | null;
  remainingToNextStage: number | null;
  /** 연결 계좌가 있는지. 없으면 금액·지금 비중을 보여주지 않는다. */
  linked: boolean;
  /** 목표 비중 → 지금 비중. 목표 종목 순서, 그 뒤 목표에 없는 보유 종목. */
  stocks: PortfolioStockRow[];
}

export function gardenFocusSummary(
  plant: PortfolioPlantView,
  portfolio: PortfolioItem,
  investments: InvestmentItem[],
  prices: Map<string, StockPricePoint>
): GardenFocusSummary {
  const accounts = resolvePortfolioAccounts(portfolio, investments);
  const linked = accounts.length > 0;
  const stocks = portfolioStockRows(portfolio.allocations, accounts, prices);
  // 목표 종목이 먼저 (목표 비중 큰 순), 그 뒤 목표에 없는 보유 종목 (금액 큰 순).
  const ordered = [
    ...stocks
      .filter((s) => s.targetPercent !== null)
      .sort((a, b) => (b.targetPercent ?? 0) - (a.targetPercent ?? 0)),
    ...stocks.filter((s) => s.targetPercent === null),
  ];
  return {
    row: gardenRow(plant, linked),
    goalState: plant.goalState,
    goalAmount: plant.goalAmount,
    goalPercent: goalProgressPercent(plant.value, plant.goalAmount),
    remainingToNextStage: plant.remainingToNextStage,
    linked,
    stocks: ordered,
  };
}

// ── 포커스 상태 ────────────────────────────────────────────────────────────

/** 포커스한 포트폴리오 id. null 이면 정원 전체. 순서가 바뀌어도 같은 식물을 가리키게 id 로 둔다. */
export type GardenFocus = string | null;

export type GardenFocusAction =
  /** 식물 탭·목록 행 탭 (`null` = 정원 빈 곳 탭). */
  | { type: "pick"; portfolioId: string | null }
  /** 목록의 "정원 전체". */
  | { type: "overview" }
  /** 뒤로가기 (앱바·Android 시스템 뒤로가기). */
  | { type: "back" }
  /** 포트폴리오 목록이 바뀜 — 포커스한 포트폴리오가 없어졌으면 정원 전체로. */
  | { type: "sync"; portfolioIds: readonly string[] };

export function gardenFocusReducer(focus: GardenFocus, action: GardenFocusAction): GardenFocus {
  switch (action.type) {
    case "pick":
      return action.portfolioId;
    case "overview":
    case "back":
      return null;
    case "sync":
      return focus !== null && !action.portfolioIds.includes(focus) ? null : focus;
  }
}

/** 뒤로가기가 정원 안에서 끝나는지 (포커스를 풀 수 있으면 true, 정원 전체면 화면 뒤로가기로 넘긴다). */
export function gardenHandlesBack(focus: GardenFocus): boolean {
  return focus !== null;
}

/** 캔버스에 넘길 포커스 index. */
export function gardenFocusIndex(
  focus: GardenFocus,
  plants: readonly Pick<PortfolioPlantView, "portfolioId">[]
): number | null {
  if (focus === null) return null;
  const index = plants.findIndex((p) => p.portfolioId === focus);
  return index < 0 ? null : index;
}

// ── 성장 축하 ──────────────────────────────────────────────────────────────

export interface GrownPlant {
  portfolioId: string;
  name: string;
  stage: PortfolioPlantView["stage"];
}

/**
 * 지난번 본 단계보다 자란 식물. 처음 볼 때(`previous` 가 null)와 새로 생긴 포트폴리오는 축하하지
 * 않는다 — 화면을 연 동안 자란 것만.
 */
export function grownSince(
  previous: ReadonlyMap<string, number> | null,
  plants: readonly Pick<PortfolioPlantView, "portfolioId" | "name" | "stage">[]
): GrownPlant[] {
  if (previous === null) return [];
  return plants.flatMap((plant) => {
    const before = previous.get(plant.portfolioId);
    return before !== undefined && plant.stage > before
      ? [{ portfolioId: plant.portfolioId, name: plant.name, stage: plant.stage }]
      : [];
  });
}

// ── 리밸런싱 배지 ──────────────────────────────────────────────────────────

export type RebalanceDestination =
  | { screen: "RebalancingDetail"; id: string }
  | { screen: "RebalancingSession"; id: string }
  | { screen: "RebalancingNew" };

/**
 * 배지를 눌렀을 때 갈 리밸런싱 화면. 리밸런싱은 계좌 단위라 리밸런싱이 필요한 연결 계좌가 하나면
 * 그 계좌로 (진행 중인 리밸런싱이 있으면 이어서), 여럿이면 새 리밸런싱에서 고른다. 없으면 null.
 */
export function rebalanceDestination(
  portfolio: PortfolioItem,
  investments: InvestmentItem[],
  prices: Map<string, StockPricePoint>,
  sessions: readonly RebalancingSession[]
): RebalanceDestination | null {
  const needing = resolvePortfolioAccounts(portfolio, investments).filter(
    (account) =>
      linkedPortfolioStatus(account.id, [portfolio], investments, prices)?.state ===
      "needs-rebalancing"
  );
  const [only] = needing;
  if (!only) return null;
  if (needing.length > 1) return { screen: "RebalancingNew" };
  const session = sessions.find((s) => s.accountId === only.id && !isRebalancingCompleted(s));
  return session
    ? { screen: "RebalancingSession", id: session.id }
    : { screen: "RebalancingDetail", id: only.id };
}
