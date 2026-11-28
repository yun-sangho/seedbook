import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { usePortfolioStore } from "@web/features/portfolio/stores/portfolio-store";
import { useRebalancingStore } from "@web/features/rebalancing/stores/rebalancing-store";
import type { BackupSections } from "./data-backup";

/**
 * 백업을 store 에 반영한다. 파일에 있는 항목만 바꾼다 — 예전 백업에는
 * 포트폴리오·리밸런싱이 없을 수 있다. 저장(·cloud 모드 동기화)은 각 store 의 persist 가 한다.
 *
 * `newIds`: 가져오며 바꾼 id (원래 → 새 id). 파일에 없어 그대로 두는 포트폴리오·리밸런싱이 복원한
 * 행을 가리키면 새 id 로 잇는다.
 */
export function restoreBackupSections(
  data: Partial<BackupSections>,
  newIds: ReadonlyMap<string, string> = new Map()
): void {
  const { investments, portfolios, rebalancingSessions } = data;
  const idOf = (id: string) => newIds.get(id) ?? id;

  if (investments) useInvestmentStore.setState({ investments });
  if (portfolios) {
    usePortfolioStore.setState({ portfolios });
  } else if (newIds.size > 0) {
    usePortfolioStore.setState((s) => ({
      portfolios: s.portfolios.map((p) => ({ ...p, accountIds: p.accountIds.map(idOf) })),
    }));
  }
  if (rebalancingSessions) {
    useRebalancingStore.setState({ sessions: rebalancingSessions });
  } else if (newIds.size > 0) {
    useRebalancingStore.setState((s) => ({
      sessions: s.sessions.map((session) => ({
        ...session,
        accountId: idOf(session.accountId),
        portfolioId: idOf(session.portfolioId),
        tasks: session.tasks.map((t) => ({ ...t, id: idOf(t.id) })),
      })),
    }));
  }
}
