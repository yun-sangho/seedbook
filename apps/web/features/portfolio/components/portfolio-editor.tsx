"use client";

import { useMemo } from "react";
import { Button } from "@web/components/ui/button";
import { Input } from "@web/components/ui/input";
import { Label } from "@web/components/ui/label";
import { Textarea } from "@web/components/ui/textarea";
import { ACCOUNT_COLORS } from "@web/features/investments/types/constants";
import { cn } from "@web/lib/utils";
import { Plus } from "lucide-react";
import { usePortfolioStore } from "../stores/portfolio-store";
import type { PortfolioItem } from "../types/types";
import { validateAllocations } from "../utils/validate-allocations";
import { PortfolioAllocationRow } from "./portfolio-allocation-row";

interface PortfolioEditorProps {
  portfolio: PortfolioItem;
}

export function PortfolioEditor({ portfolio }: PortfolioEditorProps) {
  const updatePortfolio = usePortfolioStore((s) => s.updatePortfolio);
  const addAllocation = usePortfolioStore((s) => s.addAllocation);
  const updateAllocation = usePortfolioStore((s) => s.updateAllocation);
  const setAllocationStockFromSearch = usePortfolioStore((s) => s.setAllocationStockFromSearch);
  const removeAllocation = usePortfolioStore((s) => s.removeAllocation);

  const validation = useMemo(
    () => validateAllocations(portfolio.allocations),
    [portfolio.allocations]
  );
  const disabledKeys = useMemo(
    () =>
      new Set(
        portfolio.allocations
          .filter((a) => a.market && a.ticker)
          .map((a) => `${a.market}:${a.ticker}`)
      ),
    [portfolio.allocations]
  );

  const totalPct = validation.totalPercent;
  const isOver = totalPct > 100;
  const isUnder = totalPct < 100 && portfolio.allocations.length > 0;

  return (
    <div className="space-y-6 px-4 py-5 border-t">
      {/* 메타데이터 */}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor={`portfolio-name-${portfolio.id}`}>이름</Label>
          <Input
            id={`portfolio-name-${portfolio.id}`}
            value={portfolio.name}
            onChange={(e) => updatePortfolio(portfolio.id, "name", e.target.value)}
            placeholder="포트폴리오 이름"
            className="mt-1.5"
          />
        </div>
        <div>
          <Label htmlFor={`portfolio-desc-${portfolio.id}`}>설명</Label>
          <Input
            id={`portfolio-desc-${portfolio.id}`}
            value={portfolio.description}
            onChange={(e) => updatePortfolio(portfolio.id, "description", e.target.value)}
            placeholder="이 전략의 목표나 특징"
            className="mt-1.5"
          />
        </div>
      </div>

      {/* 색상 */}
      <div>
        <Label>색상</Label>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {ACCOUNT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`색상 ${c}`}
              onClick={() => updatePortfolio(portfolio.id, "color", c)}
              className={cn(
                "h-6 w-6 rounded-full border-2 transition-transform hover:scale-110",
                portfolio.color === c
                  ? "border-foreground ring-2 ring-offset-2 ring-foreground/40"
                  : "border-transparent"
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      {/* Allocations */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>종목 비중</Label>
          <span
            className={cn(
              "text-sm font-medium tabular-nums",
              isOver ? "text-destructive" : isUnder ? "text-amber-600" : "text-emerald-600"
            )}
          >
            합계 {totalPct.toFixed(1)}% / 100%
          </span>
        </div>

        {/* 합계 게이지 */}
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full transition-all",
              isOver ? "bg-destructive" : isUnder ? "bg-amber-400" : "bg-emerald-500"
            )}
            style={{ width: `${Math.min(100, totalPct)}%` }}
          />
        </div>

        <div className="mt-3 space-y-2">
          {portfolio.allocations.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              아직 추가된 종목이 없습니다. 아래 &quot;종목 추가&quot; 로 시작하세요.
            </p>
          ) : (
            portfolio.allocations.map((a) => (
              <PortfolioAllocationRow
                key={a.id}
                allocation={a}
                disabledKeys={
                  new Set([...disabledKeys].filter((k) => k !== `${a.market}:${a.ticker}`))
                }
                onSelectStock={(allocationId, stock) =>
                  setAllocationStockFromSearch(portfolio.id, allocationId, stock)
                }
                onChangePercent={(allocationId, value) =>
                  updateAllocation(portfolio.id, allocationId, "targetPercent", value)
                }
                onRemove={(allocationId) => removeAllocation(portfolio.id, allocationId)}
              />
            ))
          )}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => addAllocation(portfolio.id)}
          className="mt-3"
        >
          <Plus className="h-4 w-4" />
          종목 추가
        </Button>

        {/* Validation 메시지 */}
        {validation.code !== "OK" && (
          <p
            className={cn(
              "mt-3 text-sm",
              validation.code === "UNDER_100" ? "text-amber-600" : "text-destructive"
            )}
          >
            {validation.message}
          </p>
        )}
      </div>

      {/* 메모 */}
      <div>
        <Label htmlFor={`portfolio-note-${portfolio.id}`}>메모</Label>
        <Textarea
          id={`portfolio-note-${portfolio.id}`}
          value={portfolio.note}
          onChange={(e) => updatePortfolio(portfolio.id, "note", e.target.value)}
          placeholder="리밸런싱 기준, 매매 규칙 등을 기록"
          className="mt-1.5"
        />
      </div>
    </div>
  );
}
