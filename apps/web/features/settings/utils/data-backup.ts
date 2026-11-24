import type { InvestmentItem } from "@web/features/investments/types/types";
import type { PortfolioItem } from "@web/features/portfolio/types/types";
import { dedupePortfolioLinks } from "@web/features/portfolio/utils/portfolio-links";
import type { RebalancingSession } from "@web/features/rebalancing/types/types";

/**
 * 설정 화면(더보기 → 설정)의 JSON 백업 (내보내기 / 가져오기 / 데모 데이터).
 *
 * 2.0: 투자 · 포트폴리오 · 리밸런싱. 1.0 백업은 투자(와 지금은 없어진 도메인)만 담고 있어
 * 가져올 때는 파일에 있는 항목만 반영한다 — 없는 항목의 현재 데이터는 건드리지 않는다.
 */
export const BACKUP_VERSION = "2.0";

export type BackupSections = {
  investments: InvestmentItem[];
  portfolios: PortfolioItem[];
  rebalancingSessions: RebalancingSession[];
};

export type Backup = BackupSections & {
  exportedAt: string;
  version: string;
  /** 내보낸 계정의 표시 (`backupAccountTag`). 이 필드가 생기기 전의 백업에는 없다. */
  accountTag: string;
};

export function buildBackup(
  sections: BackupSections,
  accountTag: string,
  now = new Date()
): Backup {
  return { ...sections, exportedAt: now.toISOString(), version: BACKUP_VERSION, accountTag };
}

export type ParsedBackup =
  | { ok: true; data: Partial<BackupSections>; accountTag: string | null }
  | { ok: false };

export function parseBackup(value: unknown): ParsedBackup {
  if (!value || typeof value !== "object") return { ok: false };
  const v = value as Record<string, unknown>;
  if (!v.version || !v.exportedAt) return { ok: false };

  const data: Partial<BackupSections> = {};
  if (Array.isArray(v.investments)) data.investments = v.investments as InvestmentItem[];
  if (Array.isArray(v.portfolios)) {
    // 한 계좌는 하나의 포트폴리오에만 — 규칙이 생기기 전의 백업일 수 있다.
    data.portfolios = dedupePortfolioLinks(v.portfolios as PortfolioItem[]);
  }
  if (Array.isArray(v.rebalancingSessions)) {
    data.rebalancingSessions = v.rebalancingSessions as RebalancingSession[];
  }
  const accountTag = typeof v.accountTag === "string" ? v.accountTag : null;
  return { ok: true, data, accountTag };
}

/** 내보내기 파일 이름. 날짜는 내보낸 시각의 UTC 날짜. */
export function backupFileName(now = new Date()): string {
  return `seedbook-data-${now.toISOString().split("T")[0]}.json`;
}
