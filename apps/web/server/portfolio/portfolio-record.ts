import type { schema } from "@seedbook/database";

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
  allocations: Array<{
    id: string;
    market: string;
    ticker: string;
    name: string;
    currency: string;
    targetPercent: number;
  }>;
};

/** pull 로 내려주는 모양 — 서버가 기록한 생성 / 수정 시각이 붙는다. */
export type PortfolioData = PortfolioFields & { createdAt: string; updatedAt: string };

type PortfolioRow = typeof schema.portfolio.$inferSelect;
type AllocationRow = typeof schema.portfolioAllocation.$inferSelect;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isText = (x: unknown): x is string => typeof x === "string";
const isNumber = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isUuid = (x: unknown): x is string => isText(x) && UUID_RE.test(x);
const isDriftMode = (x: unknown): x is PortfolioFields["driftMode"] =>
  x === "relative" || x === "absolute";

/** 외부 입력 검증. 잘못된 모양이면 `null`. */
export function parsePortfolioFields(value: unknown): PortfolioFields | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const note = v.note ?? "";
  const accountIds = v.accountIds ?? [];
  const rawAllocations = v.allocations ?? [];
  // 방식이 생기기 전 클라이언트는 보내지 않는다 — 그때의 판정 방식(%p 차이)으로 둔다.
  const driftMode = v.driftMode ?? "absolute";
  if (
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
    allocations,
  };
}

/** 포트폴리오 행 컬럼 (id / userId / 동기화 컬럼 / 생성 시각 제외). */
export function portfolioFieldsToColumns(fields: PortfolioFields) {
  return {
    name: fields.name,
    color: fields.color,
    note: fields.note,
    accountIds: fields.accountIds,
    driftMode: fields.driftMode,
    driftThresholdPercent: fields.driftThresholdPercent,
  };
}

export function portfolioAllocationRows(portfolioId: string, fields: PortfolioFields) {
  return fields.allocations.map((a) => ({ ...a, portfolioId }));
}

export function portfolioRowToData(row: PortfolioRow, allocations: AllocationRow[]): PortfolioData {
  return {
    name: row.name,
    color: row.color,
    note: row.note,
    accountIds: row.accountIds,
    driftMode: row.driftMode,
    driftThresholdPercent: row.driftThresholdPercent,
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
