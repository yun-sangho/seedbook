"use client";

import { useMemo } from "react";
import { Button } from "@web/components/ui/button";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { useStockPrices } from "@web/features/investments/utils/use-stock-prices";
import { cn } from "@web/lib/utils";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { usePortfolioStore } from "../stores/portfolio-store";
import type { PortfolioItem } from "../types/types";
import { computeActualAllocation } from "../utils/compute-actual-allocation";
import { computeDriftAlert } from "../utils/compute-drift-alert";
import { computeRebalancingGap } from "../utils/compute-rebalancing-gap";
import { resolvePortfolioAccounts } from "../utils/resolve-portfolio-accounts";
import { PortfolioComparison } from "./portfolio-comparison";
import { PortfolioEditor } from "./portfolio-editor";

interface PortfolioListProps {
  portfolios: PortfolioItem[];
}

export function PortfolioList({ portfolios }: PortfolioListProps) {
  const expandedFormId = usePortfolioStore((s) => s.expandedFormId);
  const setExpandedFormId = usePortfolioStore((s) => s.setExpandedFormId);
  const removePortfolio = usePortfolioStore((s) => s.removePortfolio);
  const investments = useInvestmentStore((s) => s.investments);

  // 모든 계좌의 holdings 를 한 번에 받아와 리스트 내 모든 포트폴리오가 공유.
  const allHoldings = useMemo(
    () => investments.flatMap((inv) => inv.holdings ?? []),
    [investments]
  );
  const { prices } = useStockPrices(allHoldings);

  return (
    <div className="space-y-3">
      {portfolios.map((portfolio) => {
        const isExpanded = expandedFormId === portfolio.id;
        const totalPct = portfolio.allocations.reduce((acc, a) => acc + (a.targetPercent || 0), 0);
        const scopedAccounts = resolvePortfolioAccounts(portfolio, investments);
        const actual = computeActualAllocation(scopedAccounts, prices);
        const summary = computeRebalancingGap(
          portfolio.allocations,
          actual.perStock,
          actual.totalStockValue,
          0
        );
        const drift = computeDriftAlert(summary, portfolio.driftThresholdPercent);
        const linkLabel =
          portfolio.accountIds.length === 0
            ? "전체 합산"
            : `계좌 ${scopedAccounts.length}/${portfolio.accountIds.length}`;
        const linkStale =
          portfolio.accountIds.length > 0 && scopedAccounts.length < portfolio.accountIds.length;

        return (
          <div key={portfolio.id} className="border rounded-xl bg-card overflow-hidden">
            {/* Header */}
            <div
              className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-accent/30 transition-colors"
              onClick={() => setExpandedFormId(isExpanded ? "" : portfolio.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setExpandedFormId(isExpanded ? "" : portfolio.id);
                }
              }}
            >
              <span
                className="h-3 w-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: portfolio.color }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold truncate">{portfolio.name}</h3>
                  {portfolio.description && (
                    <span className="text-xs text-muted-foreground truncate">
                      {portfolio.description}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground mt-0.5">
                  <span>{portfolio.allocations.length}종목</span>
                  <span
                    className={cn(
                      "tabular-nums",
                      totalPct > 100
                        ? "text-destructive"
                        : totalPct < 100
                          ? "text-amber-600"
                          : "text-emerald-600"
                    )}
                  >
                    합계 {totalPct.toFixed(1)}%
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px]",
                      linkStale
                        ? "border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                        : "border-border text-muted-foreground"
                    )}
                  >
                    {linkLabel}
                    {linkStale ? " (삭제된 계좌 포함)" : ""}
                  </span>
                  {portfolio.allocations.length > 0 && actual.totalStockValue > 0 && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                        drift.hasBreach
                          ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                      )}
                    >
                      {drift.hasBreach ? (
                        <AlertTriangle className="h-3 w-3" />
                      ) : (
                        <CheckCircle2 className="h-3 w-3" />
                      )}
                      {drift.hasBreach
                        ? `이격 초과 ${drift.breachedRows.length}건`
                        : "이격 정상"}
                    </span>
                  )}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`"${portfolio.name}" 포트폴리오를 삭제할까요?`)) {
                    removePortfolio(portfolio.id);
                  }
                }}
                aria-label="포트폴리오 삭제"
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={isExpanded ? "접기" : "펼치기"}
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedFormId(isExpanded ? "" : portfolio.id);
                }}
              >
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </div>

            {isExpanded && (
              <>
                <PortfolioEditor portfolio={portfolio} />
                <PortfolioComparison portfolio={portfolio} />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
