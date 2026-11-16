import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { usePortfolioStore } from "@web/features/portfolio/stores/portfolio-store";
import { useRebalancingStore } from "@web/features/rebalancing/stores/rebalancing-store";
import type { BackupSections } from "./data-backup";

/**
 * 백업(또는 데모 데이터)을 store 에 반영한다. 파일에 있는 항목만 바꾼다 — 예전 백업에는
 * 포트폴리오·리밸런싱이 없을 수 있다. 저장(·cloud 모드 동기화)은 각 store 의 persist 가 한다.
 */
export function restoreBackupSections(data: Partial<BackupSections>): void {
  const { investments, portfolios, rebalancingSessions } = data;
  if (investments) useInvestmentStore.setState({ investments });
  if (portfolios) usePortfolioStore.setState({ portfolios });
  if (rebalancingSessions) useRebalancingStore.setState({ sessions: rebalancingSessions });
}
