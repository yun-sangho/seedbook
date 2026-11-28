import type { InvestmentItem } from "@mobile/features/investments/types/types";
import { computeAccountValuation } from "@mobile/features/investments/utils/compute-account-valuation";
import type { StockPricePoint } from "@mobile/features/investments/utils/use-stock-prices";
import { INITIAL_PLANT_PROGRESS, MAX_PLANT_STAGE } from "../types/constants";
import type {
  PlantGoal,
  PlantKind,
  PlantProgress,
  PlantStage,
  PortfolioItem,
} from "../types/types";
import { resolvePortfolioAccounts } from "./resolve-portfolio-accounts";

/**
 * 포트폴리오 식물. 사용자가 정한 목표 금액을 포트폴리오 평가 금액(연결 계좌 합)이 넘으면 한 단계
 * 자라고 목표는 비워진다 — 사용자가 다음 목표를 새로 정한다. 꽃·열매(4)까지 자란다.
 *
 * - 목표가 없으면 그 단계에 머문다 (처음엔 씨앗).
 * - 도달한 단계는 내려가지 않는다. 금액이 마지막으로 달성한 목표보다 내려가면 '처짐' 으로만 본다.
 * - 한 번 볼 때 한 단계만 자란다 — 목표 하나가 한 단계다.
 */

export interface PortfolioValuation {
  /** 연결 계좌의 시세 있는 보유 종목 × 현재가 + 예수금 합 (원, 반올림). */
  value: number;
  /** 연결 계좌의 종목이 모두 시세를 받았는지. false 면 `value` 는 실제보다 작을 수 있다. */
  pricesComplete: boolean;
  /** 평가에 들어간 연결 계좌 수 (없어진 계좌 id 는 빠진다). */
  accountCount: number;
}

/** 포트폴리오 평가 금액 — 연결 계좌마다 화면과 같은 계좌 평가(`computeAccountValuation`)를 더한다. */
export function computePortfolioValuation(
  portfolio: Pick<PortfolioItem, "accountIds">,
  investments: InvestmentItem[],
  prices: Map<string, StockPricePoint>
): PortfolioValuation {
  const accounts = resolvePortfolioAccounts(portfolio, investments);
  let value = 0;
  let pricesComplete = true;
  for (const account of accounts) {
    const valuation = computeAccountValuation(
      account.holdings ?? [],
      account.cashItems ?? [],
      prices
    );
    value += valuation.totalValue;
    if (!valuation.allHoldingsHavePrices) pricesComplete = false;
  }
  return { value: Math.round(value), pricesComplete, accountCount: accounts.length };
}

/**
 * 지금 목표를 달성했으면 한 단계 자란 진행을 돌려준다 (목표는 비우고 이력에 남긴다). 그대로면 같은
 * 참조를 돌려준다. 시세가 빠진 평가는 실제보다 작으므로 그대로 써도 잘못 자라지 않는다.
 */
export function growPlant<T extends PlantProgress>(progress: T, value: number, now: string): T {
  const { goalAmount, growthStage } = progress;
  if (goalAmount === null || growthStage >= MAX_PLANT_STAGE || value < goalAmount) {
    return progress;
  }
  return {
    ...progress,
    goalAmount: null,
    growthStage: (growthStage + 1) as PlantStage,
    goalHistory: [...progress.goalHistory, { amount: goalAmount, reachedAt: now }],
  };
}

/** 식물 묶음 — 모드 전환 병합에서 더 자란 쪽을 통째로 고른다 (`driftSince` 는 밖). */
export const PLANT_FIELDS = [
  "season",
  "plantKind",
  "wish",
  "goalAmount",
  "growthStage",
  "goalHistory",
  "fruitGoal",
] as const satisfies ReadonlyArray<keyof PlantProgress>;

/** 더 자란 정도 비교 — (계절, 단계, 열매가 익음) 사전순. 양수면 `a` 가 더 자랐다. */
export function comparePlantGrowth(
  a: Pick<PlantProgress, "season" | "growthStage" | "fruitGoal">,
  b: Pick<PlantProgress, "season" | "growthStage" | "fruitGoal">
): number {
  return (
    a.season - b.season ||
    a.growthStage - b.growthStage ||
    Number(a.fruitGoal !== null) - Number(b.fruitGoal !== null)
  );
}

/** 두 진행 중 더 자란 쪽의 식물 묶음. 같으면 `preferred` (도달 단계는 내려가지 않는다). */
export function furtherPlantProgress<T extends PlantProgress>(
  preferred: T,
  other: PlantProgress
): T {
  if (comparePlantGrowth(other, preferred) <= 0) return preferred;
  const next = { ...preferred };
  for (const name of PLANT_FIELDS) (next as PlantProgress)[name] = other[name] as never;
  return next;
}

/** 마지막으로 달성한 목표 (없으면 null) — 처짐 판정과 다음 목표의 하한. */
export function lastReachedGoal(progress: Pick<PlantProgress, "goalHistory">): PlantGoal | null {
  return progress.goalHistory.at(-1) ?? null;
}

export type PlantGoalError = "invalid" | "fully-grown" | "not-above-last-goal";

export const PLANT_GOAL_ERROR_MESSAGES: Record<PlantGoalError, string> = {
  invalid: "목표 금액을 1원 이상으로 입력해 주세요",
  "fully-grown": "식물이 다 자랐어요",
  "not-above-last-goal": "지난번 달성한 목표보다 큰 금액이어야 해요",
};

/** 새 목표 금액 검사. 다음 목표는 마지막으로 달성한 목표보다 커야 한다. */
export function plantGoalError(progress: PlantProgress, amount: number): PlantGoalError | null {
  if (!Number.isSafeInteger(amount) || amount <= 0) return "invalid";
  if (progress.growthStage >= MAX_PLANT_STAGE) return "fully-grown";
  const last = lastReachedGoal(progress);
  if (last && amount <= last.amount) return "not-above-last-goal";
  return null;
}

/**
 * 목표 상태.
 * - `set`: 목표를 향해 자라는 중
 * - `needs-goal`: 목표가 없다 — 씨앗이거나 방금 목표를 달성해 다음 목표를 정해야 한다
 * - `complete`: 꽃·열매까지 자랐다
 */
export type PlantGoalState = "set" | "needs-goal" | "complete";

export interface PlantStatus {
  /** 지금 단계 (이번 평가로 목표를 달성했으면 자란 뒤의 단계). */
  stage: PlantStage;
  /** 마지막으로 달성한 목표보다 금액이 내려갔다. 시세가 다 오기 전에는 판정하지 않는다. */
  drooping: boolean;
  goalState: PlantGoalState;
  goalAmount: number | null;
  /** 다음 단계까지 남은 금액 (원). 목표가 없으면 null. */
  remainingToNextStage: number | null;
  /** 이번 평가로 저장된 단계보다 자랐다 — 호출측이 `growPlant` 결과를 저장해야 한다. */
  grew: boolean;
}

export function computePlantStatus(
  progress: PlantProgress,
  valuation: Pick<PortfolioValuation, "value" | "pricesComplete">
): PlantStatus {
  // 표시용 — 자란 결과를 저장하지 않으니 달성 시각은 쓰지 않는다 (저장은 `growPlant`).
  const grown = growPlant(progress, valuation.value, "");
  const last = lastReachedGoal(grown);
  const goalState: PlantGoalState =
    grown.growthStage >= MAX_PLANT_STAGE
      ? "complete"
      : grown.goalAmount === null
        ? "needs-goal"
        : "set";
  return {
    stage: grown.growthStage,
    drooping: valuation.pricesComplete && last !== null && valuation.value < last.amount,
    goalState,
    goalAmount: goalState === "set" ? grown.goalAmount : null,
    remainingToNextStage:
      goalState === "set" && grown.goalAmount !== null
        ? Math.max(0, grown.goalAmount - valuation.value)
        : null,
    grew: grown !== progress,
  };
}

const isPlantStage = (x: unknown): x is PlantStage =>
  typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= MAX_PLANT_STAGE;

const isTimestamp = (x: unknown): x is string =>
  typeof x === "string" && !Number.isNaN(Date.parse(x));

function readGoal(g: unknown): PlantGoal | null {
  if (!g || typeof g !== "object") return null;
  const { amount, reachedAt } = g as Record<string, unknown>;
  return typeof amount === "number" && Number.isFinite(amount) && typeof reachedAt === "string"
    ? { amount, reachedAt }
    : null;
}

/**
 * 저장·동기화된 값을 식물 진행으로 읽는다. 없거나 깨진 값은 첫 계절 씨앗 기본값으로 채운다 — 식물이
 * 생기기 전에 저장된 포트폴리오도 그대로 읽힌다.
 *
 * 두 기기가 다른 계절을 패치하면 필드가 섞일 수 있다. 불변식(달성 이력 수 = 단계, 열매는 4단계에서만,
 * 익은 열매 옆에는 목표 없음)에 어긋난 목표·열매는 비운다. 단계·계절은 건드리지 않는다.
 * 식물 종류는 모르는 값(새 앱이 더한 종류)도 그대로 둔다 — 지우면 그 값을 덮어쓰게 된다.
 */
export function readPlantProgress(value: {
  goalAmount?: unknown;
  growthStage?: unknown;
  goalHistory?: unknown;
  season?: unknown;
  plantKind?: unknown;
  wish?: unknown;
  fruitGoal?: unknown;
  driftSince?: unknown;
}): PlantProgress {
  const initial = INITIAL_PLANT_PROGRESS;
  const growthStage = isPlantStage(value.growthStage) ? value.growthStage : initial.growthStage;
  const goalHistory = Array.isArray(value.goalHistory)
    ? value.goalHistory.flatMap((g): PlantGoal[] => {
        const goal = readGoal(g);
        return goal ? [goal] : [];
      })
    : [];
  const fruitGoal = growthStage === MAX_PLANT_STAGE ? readGoal(value.fruitGoal) : null;
  const goalAmount =
    typeof value.goalAmount === "number" &&
    Number.isSafeInteger(value.goalAmount) &&
    value.goalAmount > 0 &&
    goalHistory.length === growthStage &&
    fruitGoal === null
      ? value.goalAmount
      : initial.goalAmount;
  return {
    goalAmount,
    growthStage,
    goalHistory,
    season:
      typeof value.season === "number" && Number.isSafeInteger(value.season) && value.season >= 1
        ? value.season
        : initial.season,
    plantKind: typeof value.plantKind === "string" ? (value.plantKind as PlantKind) : null,
    wish: typeof value.wish === "string" ? value.wish : initial.wish,
    fruitGoal,
    driftSince: isTimestamp(value.driftSince) ? value.driftSince : initial.driftSince,
  };
}
