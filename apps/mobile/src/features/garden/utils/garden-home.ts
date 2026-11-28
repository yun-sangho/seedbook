import type { InvestmentItem } from "@mobile/features/investments/types/types";
import type { PortfolioItem } from "@mobile/features/portfolio/types/types";
import type { PortfolioPlantView } from "@mobile/features/portfolio/utils/portfolio-plant-view";
import { calculateReturnRate } from "@mobile/utils/number-format";
import {
  FERN_STAGE_LABELS,
  PLANT_KINDS,
  PLANT_STAGE_LABELS,
  PLANT_STAGES,
  type PlantKind,
  type PlantOptions,
  POT_COLOR_IDS,
  type PotColor,
} from "../plant-3d/plant-options";

/**
 * 정원 홈의 순수 계산: 포트폴리오 식물 → 3D 옵션·목록 행, 포커스 상태 전환, 성장 감지.
 */

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
 * 포트폴리오의 식물 종류 (나무·고사리). 포트폴리오 id 는 씨앗을 심을 때(포트폴리오를 만들 때) 무작위로
 * 정해지므로 종류도 그때 무작위로 정해지고, 이후로는 기기·새로고침과 관계없이 같다. 화분 색과 따로
 * 정해지도록 해시에 접두사를 붙인다.
 */
export function kindForPortfolio(portfolioId: string): PlantKind {
  return PLANT_KINDS[hashString(`kind:${portfolioId}`) % PLANT_KINDS.length] ?? "tree";
}

/** 포트폴리오 식물의 종류 — 씨앗을 심을 때 고른 종류, 고르지 않았으면 `kindForPortfolio`. */
export function plantKindOf(portfolio: Pick<PortfolioItem, "id" | "plantKind">): PlantKind {
  return portfolio.plantKind ?? kindForPortfolio(portfolio.id);
}

/** 3D 식물 옵션. */
export function gardenPlantOptions(plant: PortfolioPlantView): PlantOptions {
  return {
    stage: PLANT_STAGES[plant.stage],
    wind: plant.wind,
    wilt: plant.wilt,
    ripe: plant.ripe,
    empty: plant.empty,
    needsRebalance: plant.rebalancing === "needs-rebalancing",
    pot: potForPortfolio(plant.portfolioId),
    seed: hashString(plant.portfolioId) % 1000,
    kind: plant.kind,
  };
}

/**
 * 단계 이름 — 나무는 씨앗·새싹·묘목·나무, 고사리는 씨앗·새순·어린 잎·고사리, 4단계는 둘 다 꽃·열매.
 * 목표가 없는 포트폴리오(`empty`)는 빈 화분.
 */
export function plantStageLabel(
  kind: PlantKind,
  stage: PortfolioPlantView["stage"],
  empty = false
): string {
  if (empty) return "빈 화분";
  const labels = kind === "fern" ? FERN_STAGE_LABELS : PLANT_STAGE_LABELS;
  return labels[PLANT_STAGES[stage]];
}

/** 시듦 정도(`plantWilt`) → 문구. 큰 것부터. */
const WILT_LABELS: readonly { wilt: number; label: string }[] = [
  { wilt: 1, label: "많이 시들었어요" },
  { wilt: 0.7, label: "시들해요" },
  { wilt: 0.35, label: "시들기 시작했어요" },
];

/**
 * 식물 상태 문구 — 시듦(비중 이탈 기간)과 바람(시장 하락). 아무 일 없으면 null. 열매가 열렸으면 null —
 * 이룬 것은 시듦·바람과 상관없이 그대로이고, 목표 막대가 "열매가 열렸어요" 라고 말한다.
 */
export function plantConditionLabel(
  plant: Pick<PortfolioPlantView, "wilt" | "wind" | "ripe">
): string | null {
  if (plant.ripe) return null;
  const parts: string[] = [];
  const wilt = WILT_LABELS.find((step) => plant.wilt >= step.wilt);
  if (wilt) parts.push(wilt.label);
  if (plant.wind > 0) parts.push("바람이 불어요");
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** 정원 목록(포커스 풀림)의 행 하나. */
export interface GardenRow {
  portfolioId: string;
  name: string;
  stage: PortfolioPlantView["stage"];
  pot: PotColor;
  kind: PlantKind;
  /** 평가 금액 (원). 연결 계좌가 없으면 null — "연결 계좌 없음" 으로 보인다. */
  value: number | null;
  needsRebalance: boolean;
  /** 시듦 (비중 이탈 기간, `plantWilt`). */
  wilt: number;
  /** 바람 (시장 하락, `plantWind`). */
  wind: number;
  /** 열매가 열렸다 (수확할 수 있다). */
  ripe: boolean;
  /** 빈 화분 (목표 없는 포트폴리오). */
  empty: boolean;
  /** 목표 상태 (`seasonGoalState`). */
  goalState: PortfolioPlantView["goalState"];
  /** 지금 목표 금액 (원). 목표가 없으면 null. */
  goalAmount: number | null;
  /** 지금 목표 대비 금액 (%, 소수 버림, 100 이하). 목표가 없으면 null. 목록의 도달 막대. */
  goalPercent: number | null;
  /** 연결 계좌들의 수익률 (%). 연결 계좌가 없거나 투자원금이 0 이면 null. */
  returnRate: number | null;
}

type RowAccount = Pick<InvestmentItem, "id" | "initialInvestment" | "currentValue">;

function linkedReturnRate(accounts: readonly RowAccount[]): number | null {
  const initial = accounts.reduce((sum, inv) => sum + (inv.initialInvestment || 0), 0);
  if (initial <= 0) return null;
  const current = accounts.reduce((sum, inv) => sum + (inv.currentValue || 0), 0);
  return calculateReturnRate(current, initial);
}

/** `accounts` = 그 포트폴리오에 연결된 계좌. 없으면 금액·수익률이 null. */
function gardenRow(plant: PortfolioPlantView, accounts: readonly RowAccount[]): GardenRow {
  return {
    portfolioId: plant.portfolioId,
    name: plant.name || "이름 없는 포트폴리오",
    stage: plant.stage,
    pot: potForPortfolio(plant.portfolioId),
    kind: plant.kind,
    value: accounts.length > 0 ? plant.value : null,
    needsRebalance: plant.rebalancing === "needs-rebalancing",
    wilt: plant.wilt,
    wind: plant.wind,
    ripe: plant.ripe,
    empty: plant.empty,
    goalState: plant.goalState,
    goalAmount: plant.goalAmount,
    goalPercent:
      plant.goalAmount !== null && plant.goalAmount > 0
        ? Math.min(100, Math.floor((Math.max(0, plant.value) / plant.goalAmount) * 100))
        : null,
    returnRate: linkedReturnRate(accounts),
  };
}

/**
 * 정원 목록 행. 수익률은 넘겨받은 계좌 값(`initialInvestment`·`currentValue`)으로 계산하므로
 * 지금 시세로 다시 계산한 계좌(`useLiveAccounts`)를 넘긴다.
 */
export function gardenRows(
  plants: readonly PortfolioPlantView[],
  portfolios: readonly Pick<PortfolioItem, "id" | "accountIds">[],
  investments: readonly RowAccount[]
): GardenRow[] {
  return plants.map((plant) => {
    const portfolio = portfolios.find((p) => p.id === plant.portfolioId);
    const linked = investments.filter((inv) => portfolio?.accountIds.includes(inv.id));
    return gardenRow(plant, linked);
  });
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
  kind: PlantKind;
  stage: PortfolioPlantView["stage"];
}

/**
 * 지난번 본 단계보다 자란 식물. 처음 볼 때(`previous` 가 null)와 새로 생긴 포트폴리오는 축하하지
 * 않는다 — 화면을 연 동안 자란 것만.
 */
export function grownSince(
  previous: ReadonlyMap<string, number> | null,
  plants: readonly Pick<PortfolioPlantView, "portfolioId" | "name" | "kind" | "stage">[]
): GrownPlant[] {
  if (previous === null) return [];
  return plants.flatMap((plant) => {
    const before = previous.get(plant.portfolioId);
    return before !== undefined && plant.stage > before
      ? [{ portfolioId: plant.portfolioId, name: plant.name, kind: plant.kind, stage: plant.stage }]
      : [];
  });
}
