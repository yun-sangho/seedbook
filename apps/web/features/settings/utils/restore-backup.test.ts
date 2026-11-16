import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import type { InvestmentItem } from "@web/features/investments/types/types";
import { usePortfolioStore } from "@web/features/portfolio/stores/portfolio-store";
import type { PortfolioItem } from "@web/features/portfolio/types/types";
import { useRebalancingStore } from "@web/features/rebalancing/stores/rebalancing-store";
import type { RebalancingSession } from "@web/features/rebalancing/types/types";
import { beforeEach, describe, expect, it } from "vitest";
import { restoreBackupSections } from "./restore-backup";

const account = (id: string) => ({ id, accountName: id }) as InvestmentItem;
const portfolio = (id: string) =>
  ({ id, name: id, accountIds: [], allocations: [] }) as unknown as PortfolioItem;
const session = (id: string) =>
  ({ id, accountId: "acc-1", tasks: [] }) as unknown as RebalancingSession;

describe("restoreBackupSections", () => {
  beforeEach(() => {
    useInvestmentStore.setState({ investments: [account("current-acc")] });
    usePortfolioStore.setState({ portfolios: [portfolio("current-portfolio")] });
    useRebalancingStore.setState({ sessions: [session("current-session")] });
  });

  it("replaces every section the backup contains", () => {
    restoreBackupSections({
      investments: [account("backup-acc")],
      portfolios: [portfolio("backup-portfolio")],
      rebalancingSessions: [session("backup-session")],
    });

    expect(useInvestmentStore.getState().investments).toEqual([account("backup-acc")]);
    expect(usePortfolioStore.getState().portfolios).toEqual([portfolio("backup-portfolio")]);
    expect(useRebalancingStore.getState().sessions).toEqual([session("backup-session")]);
  });

  it("leaves sections missing from an older backup untouched", () => {
    restoreBackupSections({ investments: [account("backup-acc")] });

    expect(useInvestmentStore.getState().investments).toEqual([account("backup-acc")]);
    expect(usePortfolioStore.getState().portfolios).toEqual([portfolio("current-portfolio")]);
    expect(useRebalancingStore.getState().sessions).toEqual([session("current-session")]);
  });
});
