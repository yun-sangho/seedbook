import { numberToKorean } from "@mobile/utils/number-format";
import {
  harvestId,
  type harvest as harvestRecord,
  type RecordValues,
  UUID_PATTERN,
  uuidv5,
} from "@seedbook/domain";
import { kstMidnight } from "@seedbook/domain/kst";
import { MAX_PLANT_STAGE } from "../types/constants";
import type { PlantKind, PlantProgress, PlantStage } from "../types/types";
import { lastReachedGoal, type PortfolioValuation } from "./portfolio-plant";

/**
 * 포트폴리오 식물의 계절 규칙 (명세 `docs/plant-growth.md` §3·§4·§5).
 *
 * - 목표는 지금 평가금액과 이번 계절 마지막 달성 목표 중 큰 값의 +10% 이상이어야 한다 (정할 때만).
 * - 금액이 목표에 닿고 **비중이 기준 안** 이어야 한 단계 자란다. 4단계에서 다섯 번째(열매) 목표를
 *   이루면 열매가 열리고 바로 수확할 수 있다 (익어 가는 단계는 없다). 수확하면 수확 기록을 남기고 다음 계절이 씨앗부터 시작한다.
 * - 비중 이탈을 처음 본 날(`driftSince`)부터 센 기간으로 시든다. 시듦은 보이기만 한다.
 *
 * 화면 연결은 다음 태스크(씨앗 심기·수확 화면)에서 한다 — 그때 `growPlant`·`plantGoalError` 를 대신한다.
 */

/** 목표 하한 배율 — 지금보다 10% 이상. */
const GOAL_FLOOR_PERCENT = 110;
/** 목표 하한을 올려 맞추는 단위 (원). */
const GOAL_FLOOR_UNIT = 10_000;
/** 소원 최대 길이 (클라이언트 검사, 레코드 정의는 제한하지 않는다). */
export const WISH_MAX_LENGTH = 100;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 한 평가 — 평가금액, 시세가 다 왔는지, 비중이 기준을 벗어났는지. */
export interface PlantEvaluation extends Pick<PortfolioValuation, "value" | "pricesComplete"> {
  drifting: boolean;
}

// ─── 목표 하한 ──────────────────────────────────────────────────────────────

/**
 * 다음 목표의 하한 (원) = ceil(max(평가금액, 마지막 달성 목표) × 1.1, 만원). 시세가 다 오기 전에는
 * 평가금액이 실제보다 작을 수 있어 정하지 않는다 (null). 연결 계좌가 없으면 평가금액은 0 이다.
 */
export function nextGoalFloor(
  progress: Pick<PlantProgress, "goalHistory">,
  valuation: Pick<PortfolioValuation, "value" | "pricesComplete">
): number | null {
  if (!valuation.pricesComplete) return null;
  const base = Math.max(0, valuation.value, lastReachedGoal(progress)?.amount ?? 0);
  // 정수 연산으로 올린다 (× 1.1 은 부동소수 오차로 만원을 하나 더 올릴 수 있다).
  const units = Math.ceil((base * GOAL_FLOOR_PERCENT) / (100 * GOAL_FLOOR_UNIT));
  return units * GOAL_FLOOR_UNIT;
}

export type NextGoalError = "invalid" | "ripe" | "prices-loading" | "below-floor";

export const NEXT_GOAL_ERROR_MESSAGES: Record<NextGoalError, (floor: number | null) => string> = {
  invalid: () => "목표 금액을 1원 이상으로 입력해 주세요",
  ripe: () => "열매가 열렸어요 — 수확한 뒤 새 목표를 정해요",
  "prices-loading": () => "시세를 불러오는 중이에요",
  "below-floor": (floor) =>
    `목표는 ${numberToKorean(floor ?? 0)} 이상이어야 해요 (지금보다 10% 이상)`,
};

/**
 * 새 목표 (4단계면 열매 목표) 검사. 하한은 정할 때만 본다 — 이미 정해 둔 목표는 그대로 둔다.
 * 레코드 정의의 검증(`min: 1`)은 바꾸지 않는다 (서버 검증 강화는 깨는 변경).
 */
export function nextGoalError(
  progress: Pick<PlantProgress, "goalHistory" | "fruitGoal">,
  amount: number,
  valuation: Pick<PortfolioValuation, "value" | "pricesComplete">
): NextGoalError | null {
  if (!Number.isSafeInteger(amount) || amount <= 0) return "invalid";
  if (progress.fruitGoal !== null) return "ripe";
  const floor = nextGoalFloor(progress, valuation);
  if (floor === null) return "prices-loading";
  if (amount < floor) return "below-floor";
  return null;
}

// ─── 성장 ───────────────────────────────────────────────────────────────────

/** 이번 평가로 목표를 이뤘는가 — 목표가 있고, 시세가 다 왔고, 금액이 닿았고, 비중이 기준 안. */
function reachesGoal(progress: PlantProgress, evaluation: PlantEvaluation): boolean {
  const { goalAmount } = progress;
  return (
    goalAmount !== null &&
    evaluation.pricesComplete &&
    evaluation.value >= goalAmount &&
    !evaluation.drifting
  );
}

/**
 * 목표를 이뤘으면 한 단계 자란 진행 (목표는 비우고 이력에 남긴다). 4단계(꽃)에서는 열매가 열린다
 * (`fruitGoal`, 단계는 그대로). 그대로면 같은 참조를 돌려준다. 한 평가에 한 단계만 자란다.
 */
export function advancePlant<T extends PlantProgress>(
  progress: T,
  evaluation: PlantEvaluation,
  now: string
): T {
  if (progress.fruitGoal !== null || !reachesGoal(progress, evaluation)) return progress;
  const goal = { amount: progress.goalAmount as number, reachedAt: now };
  if (progress.growthStage >= MAX_PLANT_STAGE) {
    return { ...progress, goalAmount: null, fruitGoal: goal };
  }
  return {
    ...progress,
    goalAmount: null,
    growthStage: (progress.growthStage + 1) as PlantStage,
    goalHistory: [...progress.goalHistory, goal],
  };
}

/**
 * 목표 상태.
 * - `needs-goal`: 목표를 정해야 한다 (씨앗이거나 방금 한 단계 자랐다)
 * - `set`: 목표를 향해 자라는 중
 * - `blocked-by-drift`: 금액은 목표에 닿았는데 비중이 기준 밖 — 비중을 맞추면 자란다
 * - `needs-fruit-goal`: 꽃까지 자랐다 — 열매 목표를 정한다
 * - `ripe`: 열매가 열렸다 — 바로 수확할 수 있다 (시듦·바람과 상관없이)
 */
export type SeasonGoalState =
  | "needs-goal"
  | "set"
  | "blocked-by-drift"
  | "needs-fruit-goal"
  | "ripe";

/** 저장된 진행의 목표 상태. 이번 평가로 자랄 수 있으면 `advancePlant` 를 먼저 저장한다. */
export function seasonGoalState(
  progress: PlantProgress,
  evaluation: PlantEvaluation
): SeasonGoalState {
  if (progress.fruitGoal !== null) return "ripe";
  if (progress.goalAmount === null) {
    return progress.growthStage >= MAX_PLANT_STAGE ? "needs-fruit-goal" : "needs-goal";
  }
  const reachedAmount = evaluation.pricesComplete && evaluation.value >= progress.goalAmount;
  return reachedAmount && evaluation.drifting ? "blocked-by-drift" : "set";
}

/**
 * 비중이 기준 밖인가 (`computeDriftAlert(...).hasBreach`). 연결 계좌가 없거나 목표 비중이 비어 있으면
 * 판정할 수 없으니 기준 안으로 본다 — 금액만으로 자라고 시들지 않는다.
 */
export function isPlantDrifting(input: {
  accountCount: number;
  hasAllocations: boolean;
  hasBreach: boolean;
}): boolean {
  return input.accountCount > 0 && input.hasAllocations && input.hasBreach;
}

// ─── 이탈 기간·시듦 ─────────────────────────────────────────────────────────

/** KST 날짜 `now` 의 00:00 (ISO). */
function kstStartOfDay(now: string): string {
  return kstMidnight(new Date(now)).toISOString();
}

/**
 * 시세가 다 온 평가에서 이탈 시작일을 기록한다. 이탈인데 없으면 오늘(KST) 시작, 기준 안인데 있으면
 * 지운다 (바로 회복). 그대로면 같은 참조.
 */
export function trackDriftSince<T extends PlantProgress>(
  progress: T,
  drifting: boolean,
  now: string
): T {
  if (drifting && progress.driftSince === null) {
    return { ...progress, driftSince: kstStartOfDay(now) };
  }
  if (!drifting && progress.driftSince !== null) return { ...progress, driftSince: null };
  return progress;
}

/** 이탈한 지 며칠 (KST 달력일). 앱을 열지 않은 날도 센다. 이탈이 없거나 읽을 수 없으면 0. */
export function driftDays(driftSince: string | null, now: string): number {
  if (driftSince === null) return 0;
  const since = Date.parse(driftSince);
  if (Number.isNaN(since)) return 0;
  const from = Date.parse(kstStartOfDay(new Date(since).toISOString()));
  const to = Date.parse(kstStartOfDay(now));
  return Math.max(0, Math.round((to - from) / DAY_MS));
}

/** 시듦 단계 (일수 하한 → wilt). 7일 전에는 기울기만. */
const WILT_STEPS: ReadonlyArray<readonly [number, number]> = [
  [28, 1],
  [14, 0.7],
  [7, 0.35],
];

/** 이탈 기간의 시듦 정도 (0~1). 평가금액 하락은 시들게 하지 않는다. */
export function plantWilt(days: number): number {
  for (const [minDays, wilt] of WILT_STEPS) if (days >= minDays) return wilt;
  return 0;
}

// ─── 수확·새 계절 ───────────────────────────────────────────────────────────

/**
 * UUID 가 아닌 (기기 안에서만 쓰던) 포트폴리오 id 의 수확 기록 id namespace. 그 포트폴리오는 동기화되지
 * 않지만 수확 기록은 레코드 키가 UUID 여야 한다.
 */
const LEGACY_PORTFOLIO_HARVEST_NAMESPACE = "3f0d6f0e-6c1b-4b8e-9a43-5e2a7c9d1b60";

function seasonHarvestId(portfolioId: string, season: number): string {
  return UUID_PATTERN.test(portfolioId)
    ? harvestId(portfolioId, season)
    : uuidv5(LEGACY_PORTFOLIO_HARVEST_NAMESPACE, `${portfolioId}:season:${season}`);
}

/** 수확 기록 (`harvest` 레코드 + id). */
export type HarvestItem = { id: string } & RecordValues<typeof harvestRecord>;

/**
 * 열매가 열린 식물을 수확한다 — 수확 기록과 다음 계절의 씨앗 (`season + 1`, 단계·목표·열매·소원을 비운다.
 * 이탈 시작일은 계절과 무관해 그대로). 열매가 열리지 않았으면 null. `shownKind` 는 종류를 고른 적
 * 없을 때 화면에 보이던 종류 (`kindForPortfolio`).
 */
export function harvestPlant<T extends PlantProgress & { id: string; name: string }>(
  portfolio: T,
  shownKind: PlantKind,
  now: string
): { harvest: HarvestItem; progress: T } | null {
  const { fruitGoal } = portfolio;
  if (fruitGoal === null) return null;
  return {
    harvest: {
      id: seasonHarvestId(portfolio.id, portfolio.season),
      sourceType: "portfolio",
      sourceId: portfolio.id,
      sourceName: portfolio.name,
      season: portfolio.season,
      plantKind: portfolio.plantKind ?? shownKind,
      wish: portfolio.wish,
      goals: [...portfolio.goalHistory, fruitGoal],
      harvestedAt: now,
      doneAt: null,
    },
    progress: {
      ...portfolio,
      season: portfolio.season + 1,
      growthStage: 0,
      goalAmount: null,
      goalHistory: [],
      fruitGoal: null,
      wish: "",
    },
  };
}

export type WishError = "too-long";

/** 소원 검사 — 비워 둘 수 있고 최대 100자. */
export function wishError(wish: string): WishError | null {
  return wish.trim().length > WISH_MAX_LENGTH ? "too-long" : null;
}

/** 씨앗 심기 — 이번 계절의 식물 종류와 소원을 정한다. */
export function startPlantSeason<T extends PlantProgress>(
  progress: T,
  input: { plantKind: PlantKind; wish: string }
): T {
  return { ...progress, plantKind: input.plantKind, wish: input.wish.trim() };
}
