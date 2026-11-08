import { dedupePortfolioLinks } from "@web/features/portfolio/utils/portfolio-links";
import type { CloudStoreKey } from "./storage-mode";

/**
 * 저장소 모드를 바꿀 때 (브라우저 ↔ 클라우드) 양쪽 데이터를 합친다.
 *
 * 원칙: **전환으로 데이터를 잃지 않는다.**
 *   - 한쪽에만 있는 항목은 그대로 남긴다 (합집합).
 *   - 같은 항목이 양쪽에 있으면 로컬(지금 이 기기에서 쓰던 쪽)이 이긴다.
 *   - 순서는 로컬 순서 → 클라우드에만 있는 항목(클라우드 순서).
 * 대가로, 한쪽에서만 지운 항목은 전환 뒤 되살아날 수 있다.
 */

export type PersistEnvelope = { state: Record<string, unknown>; version: number };

/** store 별로 합칠 목록 필드와 항목을 구분하는 키. */
const LIST_FIELDS: Record<CloudStoreKey, { field: string; key: string }> = {
  "investment-storage": { field: "investments", key: "id" },
  "savings-storage": { field: "savings", key: "id" },
  "debts-storage": { field: "debts", key: "id" },
  "real-assets-storage": { field: "realAssets", key: "id" },
  "asset-plan-storage": { field: "plans", key: "id" },
  "progress-storage": { field: "progressPoints", key: "date" },
  "portfolio-storage": { field: "portfolios", key: "id" },
};

type Row = Record<string, unknown>;

function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? (value.filter((v) => v && typeof v === "object") as Row[]) : [];
}

function unionBy(local: Row[], cloud: Row[], key: string): Row[] {
  const seen = new Set(local.map((r) => r[key]));
  return [...local, ...cloud.filter((r) => !seen.has(r[key]))];
}

export function mergeEnvelopes(
  storeKey: CloudStoreKey,
  local: PersistEnvelope | null,
  cloud: PersistEnvelope | null
): PersistEnvelope | null {
  if (!local) return cloud;
  if (!cloud) return local;

  const { field, key } = LIST_FIELDS[storeKey];
  let rows = unionBy(asRows(local.state[field]), asRows(cloud.state[field]), key);
  if (storeKey === "portfolio-storage") {
    // 한 계좌는 하나의 포트폴리오에만 — 양쪽 포트폴리오가 같은 계좌를 잡고 있을 수 있다.
    rows = dedupePortfolioLinks(
      rows.map((r) => ({
        ...r,
        accountIds: Array.isArray(r.accountIds) ? (r.accountIds as string[]) : [],
        updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : undefined,
      }))
    );
  }

  return {
    state: { ...cloud.state, ...local.state, [field]: rows },
    // 낮은 버전으로 내보내 클라이언트 migrate 가 양쪽 항목 모두에 돈다
    // (클라우드 envelope 은 원래부터 낮은 버전으로 와서 매 로드마다 migrate 된다).
    version: Math.min(local.version, cloud.version),
  };
}
