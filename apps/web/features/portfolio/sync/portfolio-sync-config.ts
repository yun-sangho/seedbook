import type { ManagedStoreConfig } from "@web/lib/sync/managed-store-config";
import { LEGACY_DRIFT_MODE } from "../types/constants";
import type { DriftMode, PortfolioItem } from "../types/types";

const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const text = (value: unknown) => (typeof value === "string" ? value : "");
// 방식이 없는 데이터는 방식이 생기기 전에 저장된 것 — 그때처럼 %p 차이로 판정한다.
const driftMode = (value: unknown): DriftMode =>
  value === "relative" || value === "absolute" ? value : LEGACY_DRIFT_MODE;

/**
 * 포트폴리오 store (`portfolio-storage`) 의 엔티티 동기화 설정. store 를 import 하지 않는다.
 *
 * `createdAt` / `updatedAt` 은 서버가 기록한 값을 받기만 한다 — 보내지 않으므로 시각만
 * 바뀐 수정(touch)은 동기화 대상이 아니다. `updatedAt` 은 "한 계좌 = 한 포트폴리오" 정리에서
 * 최근 것을 고르는 기준이라 서버 저장 시각을 쓰는 편이 기기 사이에 일관된다.
 */
export const portfolioSyncConfig: ManagedStoreConfig<PortfolioItem> = {
  storageKey: "portfolio-storage",
  entity: "portfolio",
  listOrderDomain: "portfolios",
  metaKey: "seedbook.sync.portfolio",
  persistVersion: 3,
  itemsField: "portfolios",
  toData: (item) => ({
    name: text(item.name),
    color: text(item.color),
    note: text(item.note),
    accountIds: (item.accountIds ?? []).filter((id) => typeof id === "string"),
    driftMode: driftMode(item.driftMode),
    driftThresholdPercent: num(item.driftThresholdPercent),
    allocations: (item.allocations ?? []).map((a) => ({
      id: text(a.id),
      market: text(a.market),
      ticker: text(a.ticker),
      name: text(a.name),
      currency: text(a.currency),
      targetPercent: num(a.targetPercent),
    })),
  }),
  fromData: (id, data) => ({
    id,
    name: text(data.name),
    color: text(data.color),
    allocations: (Array.isArray(data.allocations)
      ? (data.allocations as Array<Record<string, unknown>>)
      : []
    ).map((a) => ({
      id: text(a.id),
      market: text(a.market),
      ticker: text(a.ticker),
      name: text(a.name),
      currency: text(a.currency),
      targetPercent: num(a.targetPercent),
    })),
    accountIds: Array.isArray(data.accountIds)
      ? (data.accountIds as unknown[]).filter((x): x is string => typeof x === "string")
      : [],
    driftMode: driftMode(data.driftMode),
    driftThresholdPercent: num(data.driftThresholdPercent),
    note: text(data.note),
    createdAt: text(data.createdAt),
    updatedAt: text(data.updatedAt),
  }),
};
