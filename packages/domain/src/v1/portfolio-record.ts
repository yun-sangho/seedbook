import { MAX_PLANT_STAGE, type PlantProgress } from "./portfolio-types";
import type { PortfolioAllocationRow, PortfolioRow } from "./rows";

/**
 * 포트폴리오 한 건의 동기화 표현 (`features/portfolio` 의 `PortfolioItem`, id 제외).
 * 종목별 목표 비중(`allocations`)은 포트폴리오에 딸린 하위 데이터라 함께 주고받는다.
 * `createdAt` / `updatedAt` 은 서버가 정한다 (pull 로 내려줄 때만 붙는다).
 */
export type PortfolioFields = {
  name: string;
  color: string;
  note: string;
  accountIds: string[];
  driftMode: "relative" | "absolute";
  driftThresholdPercent: number;
  /**
   * 식물 진행 (지금 목표·도달 단계·달성한 목표). 식물이 생기기 전 클라이언트는 보내지 않는다 —
   * 그때는 저장된 값을 그대로 둔다.
   */
  plant?: PlantProgress;
  allocations: Array<{
    id: string;
    market: string;
    ticker: string;
    name: string;
    currency: string;
    targetPercent: number;
  }>;
};

/** pull 로 내려주는 모양 — 식물 진행은 펼쳐서, 서버가 기록한 생성 / 수정 시각이 붙는다. */
export type PortfolioData = Omit<PortfolioFields, "plant"> &
  PlantProgress & { createdAt: string; updatedAt: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isText = (x: unknown): x is string => typeof x === "string";
const isNumber = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isUuid = (x: unknown): x is string => isText(x) && UUID_RE.test(x);
const isDriftMode = (x: unknown): x is PortfolioFields["driftMode"] =>
  x === "relative" || x === "absolute";
const isPositiveAmount = (x: unknown): x is number =>
  typeof x === "number" && Number.isSafeInteger(x) && x > 0;
const isTimestamp = (x: unknown): x is string => isText(x) && !Number.isNaN(Date.parse(x));

/**
 * 식물 진행 검증. 세 필드가 모두 없으면 `undefined` (식물 이전 클라이언트), 하나라도 잘못되면 `null`.
 * 달성한 목표 수는 단계 수를 넘을 수 없다.
 */
function parsePlantProgress(v: Record<string, unknown>): PlantProgress | null | undefined {
  if (v.goalAmount === undefined && v.growthStage === undefined && v.goalHistory === undefined) {
    return undefined;
  }
  const goalAmount = v.goalAmount ?? null;
  const growthStage = v.growthStage ?? 0;
  const rawHistory = v.goalHistory ?? [];
  if (
    (goalAmount !== null && !isPositiveAmount(goalAmount)) ||
    typeof growthStage !== "number" ||
    !Number.isInteger(growthStage) ||
    growthStage < 0 ||
    growthStage > MAX_PLANT_STAGE ||
    !Array.isArray(rawHistory) ||
    rawHistory.length > MAX_PLANT_STAGE
  ) {
    return null;
  }
  const goalHistory: PlantProgress["goalHistory"] = [];
  for (const raw of rawHistory) {
    const g = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
    if (!g || !isPositiveAmount(g.amount) || !isTimestamp(g.reachedAt)) return null;
    goalHistory.push({ amount: g.amount, reachedAt: g.reachedAt });
  }
  return {
    goalAmount,
    growthStage: growthStage as PlantProgress["growthStage"],
    goalHistory,
  };
}

/** 외부 입력 검증. 잘못된 모양이면 `null`. */
export function parsePortfolioFields(value: unknown): PortfolioFields | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const note = v.note ?? "";
  const accountIds = v.accountIds ?? [];
  const rawAllocations = v.allocations ?? [];
  // 방식이 생기기 전 클라이언트는 보내지 않는다 — 그때의 판정 방식(%p 차이)으로 둔다.
  const driftMode = v.driftMode ?? "absolute";
  const plant = parsePlantProgress(v);
  if (
    plant === null ||
    !isText(v.name) ||
    !isText(v.color) ||
    !isText(note) ||
    !isDriftMode(driftMode) ||
    !isNumber(v.driftThresholdPercent) ||
    v.driftThresholdPercent < 0 ||
    !Array.isArray(accountIds) ||
    !accountIds.every(isUuid) ||
    !Array.isArray(rawAllocations)
  ) {
    return null;
  }

  const allocations: PortfolioFields["allocations"] = [];
  for (const raw of rawAllocations) {
    const a = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
    if (
      !a ||
      !isUuid(a.id) ||
      !isText(a.market) ||
      !isText(a.ticker) ||
      !isText(a.name) ||
      !isText(a.currency) ||
      !isNumber(a.targetPercent)
    ) {
      return null;
    }
    allocations.push({
      id: a.id,
      market: a.market,
      ticker: a.ticker,
      name: a.name,
      currency: a.currency,
      targetPercent: a.targetPercent,
    });
  }

  return {
    name: v.name,
    color: v.color,
    note,
    accountIds: Array.from(new Set(accountIds)),
    driftMode,
    driftThresholdPercent: v.driftThresholdPercent,
    ...(plant ? { plant } : {}),
    allocations,
  };
}

/**
 * 포트폴리오 행 컬럼 (id / userId / 동기화 컬럼 / 생성 시각 제외). 식물 진행이 없으면 식물 컬럼을
 * 넣지 않는다 — 새 행은 씨앗(컬럼 기본값), 있던 행은 저장된 진행을 그대로 둔다.
 */
export function portfolioFieldsToColumns(fields: PortfolioFields) {
  return {
    name: fields.name,
    color: fields.color,
    note: fields.note,
    accountIds: fields.accountIds,
    driftMode: fields.driftMode,
    driftThresholdPercent: fields.driftThresholdPercent,
    ...(fields.plant
      ? {
          goalAmount: fields.plant.goalAmount,
          growthStage: fields.plant.growthStage,
          goalHistory: fields.plant.goalHistory,
        }
      : {}),
  };
}

export function portfolioAllocationRows(portfolioId: string, fields: PortfolioFields) {
  return fields.allocations.map((a) => ({ ...a, portfolioId }));
}

export function portfolioRowToData(
  row: PortfolioRow,
  allocations: PortfolioAllocationRow[]
): PortfolioData {
  return {
    name: row.name,
    color: row.color,
    note: row.note,
    accountIds: row.accountIds,
    driftMode: row.driftMode,
    driftThresholdPercent: row.driftThresholdPercent,
    goalAmount: row.goalAmount,
    growthStage: row.growthStage as PlantProgress["growthStage"],
    goalHistory: row.goalHistory,
    allocations: allocations.map((a) => ({
      id: a.id,
      market: a.market,
      ticker: a.ticker,
      name: a.name,
      currency: a.currency,
      targetPercent: a.targetPercent,
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
