import type { InvestmentItem } from "@mobile/features/investments/types/types";
import { computeAccountValuation } from "@mobile/features/investments/utils/compute-account-valuation";
import type { StockPricePoint } from "@mobile/features/investments/utils/use-stock-prices";
import { PLANT_WISH_HISTORY_MAX } from "@seedbook/domain";
import { INITIAL_PLANT_PROGRESS, MAX_PLANT_STAGE } from "../types/constants";
import type {
  PlantGoal,
  PlantKind,
  PlantProgress,
  PlantStage,
  PlantWish,
  PortfolioItem,
} from "../types/types";
import { resolvePortfolioAccounts } from "./resolve-portfolio-accounts";

/**
 * 포트폴리오 식물의 평가금액·저장 값 읽기·모드 전환 병합. 자라는 규칙(목표 하한, 비중 조건, 시듦, 수확)은
 * `plant-season.ts`.
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

/** 식물 묶음 — 모드 전환 병합에서 더 자란 쪽을 통째로 고른다 (`driftSince` 는 밖). */
export const PLANT_FIELDS = [
  "season",
  "plantKind",
  "plantName",
  "wish",
  "wishHistory",
  "goalAmount",
  "growthStage",
  "goalHistory",
  "fruitGoal",
  "stageGoals",
] as const satisfies ReadonlyArray<keyof PlantProgress>;

/** 더 자란 정도 비교 — (수확 주기 번호, 단계, 열매가 열림) 사전순. 양수면 `a` 가 더 자랐다. */
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

function readWish(w: unknown): PlantWish | null {
  if (!w || typeof w !== "object") return null;
  const { wish, at } = w as Record<string, unknown>;
  if (typeof wish !== "string") return null;
  if (at === null) return { wish, at: null };
  return isTimestamp(at) ? { wish, at } : null;
}

/** 단계 목표 읽기 — 양의 정수 금액이 아니면 전부 버린다 (예전처럼 단계마다 목표를 정한다). */
function readStageGoals(value: unknown): number[] {
  if (!Array.isArray(value) || value.length > MAX_PLANT_STAGE + 1) return [];
  return value.every((g) => typeof g === "number" && Number.isSafeInteger(g) && g > 0)
    ? (value as number[])
    : [];
}

/** 소원 이력 읽기 — 깨진 항목은 빼고 최근 `PLANT_WISH_HISTORY_MAX` 개. */
export function readWishHistory(value: unknown): PlantWish[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((w): PlantWish[] => {
      const wish = readWish(w);
      return wish ? [wish] : [];
    })
    .slice(-PLANT_WISH_HISTORY_MAX);
}

/**
 * 저장·동기화된 값을 식물 진행으로 읽는다. 없거나 깨진 값은 첫 수확 주기의 빈 화분 기본값으로 채운다 — 식물이
 * 생기기 전에 저장된 포트폴리오도 그대로 읽힌다.
 *
 * 두 기기가 다른 수확 주기를 패치하면 (한쪽은 이미 수확) 필드가 섞일 수 있다. 불변식(달성 이력 수 = 단계, 열매는 4단계에서만,
 * 열린 열매 옆에는 목표 없음)에 어긋난 목표·열매는 비운다. 단계·수확 주기 번호는 건드리지 않는다.
 * 식물 종류는 모르는 값(새 앱이 더한 종류)도 그대로 둔다 — 지우면 그 값을 덮어쓰게 된다.
 */
export function readPlantProgress(value: {
  goalAmount?: unknown;
  growthStage?: unknown;
  goalHistory?: unknown;
  season?: unknown;
  plantKind?: unknown;
  plantName?: unknown;
  wish?: unknown;
  wishHistory?: unknown;
  fruitGoal?: unknown;
  stageGoals?: unknown;
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
    plantName: typeof value.plantName === "string" ? value.plantName : initial.plantName,
    wish: typeof value.wish === "string" ? value.wish : initial.wish,
    wishHistory: readWishHistory(value.wishHistory),
    fruitGoal,
    stageGoals: readStageGoals(value.stageGoals),
    driftSince: isTimestamp(value.driftSince) ? value.driftSince : initial.driftSince,
  };
}
