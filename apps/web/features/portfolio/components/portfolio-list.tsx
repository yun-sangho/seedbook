"use client";

import { Button } from "@web/components/ui/button";
import { cn } from "@web/lib/utils";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { usePortfolioStore } from "../stores/portfolio-store";
import type { PortfolioItem } from "../types/types";
import { PortfolioComparison } from "./portfolio-comparison";
import { PortfolioEditor } from "./portfolio-editor";

interface PortfolioListProps {
  portfolios: PortfolioItem[];
}

export function PortfolioList({ portfolios }: PortfolioListProps) {
  const expandedFormId = usePortfolioStore((s) => s.expandedFormId);
  const setExpandedFormId = usePortfolioStore((s) => s.setExpandedFormId);
  const removePortfolio = usePortfolioStore((s) => s.removePortfolio);

  return (
    <div className="space-y-3">
      {portfolios.map((portfolio) => {
        const isExpanded = expandedFormId === portfolio.id;
        const totalPct = portfolio.allocations.reduce((acc, a) => acc + (a.targetPercent || 0), 0);
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
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
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
