"use client";

import { useMemo } from "react";
import { Button } from "@web/components/ui/button";
import { Input } from "@web/components/ui/input";
import { Label } from "@web/components/ui/label";
import { Textarea } from "@web/components/ui/textarea";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { ACCOUNT_COLORS } from "@web/features/investments/types/constants";
import { cn } from "@web/lib/utils";
import { parseNumericString } from "@web/utils/number-format";
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
  const toggleAccountLink = usePortfolioStore((s) => s.toggleAccountLink);
  const setDriftThreshold = usePortfolioStore((s) => s.setDriftThreshold);

  const investments = useInvestmentStore((s) => s.investments);
  const linkedIdSet = useMemo(() => new Set(portfolio.accountIds), [portfolio.accountIds]);

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

      {/* 적용 계좌 */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <Label>적용 계좌</Label>
          <span className="text-xs text-muted-foreground">
            {portfolio.accountIds.length === 0
              ? "연결 없음 = 전체 계좌 합산"
              : `${portfolio.accountIds.length}개 계좌 연결`}
          </span>
        </div>
        {investments.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            등록된 투자 계좌가 없습니다. 투자 계좌를 먼저 추가한 뒤 연결할 수 있습니다.
          </p>
        ) : (
          <div className="grid gap-1.5 sm:grid-cols-2">
            {investments.map((inv) => {
              const checked = linkedIdSet.has(inv.id);
              return (
                <label
                  key={inv.id}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer transition-colors",
                    checked ? "border-primary bg-primary/5" : "hover:bg-muted/40"
                  )}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={checked}
                    onChange={() => toggleAccountLink(portfolio.id, inv.id)}
                  />
                  <span
                    className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: inv.color }}
                  />
                  <span className="truncate text-sm font-medium">{inv.accountName}</span>
                  {inv.accountType && (
                    <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground flex-shrink-0">
                      {inv.accountType}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* 이격률 경고 임계 */}
      <div>
        <Label htmlFor={`portfolio-drift-${portfolio.id}`}>이격률 경고 임계 (%)</Label>
        <div className="mt-1.5 flex items-center gap-2">
          <Input
            id={`portfolio-drift-${portfolio.id}`}
            type="text"
            inputMode="decimal"
            className="w-32 tabular-nums"
            value={String(portfolio.driftThresholdPercent)}
            onChange={(e) => {
              const num = parseNumericString(e.target.value);
              setDriftThreshold(portfolio.id, Number.isFinite(num) ? num : 0);
            }}
          />
          <span className="text-xs text-muted-foreground">
            목표 대비 |차이|%가 이 값보다 크면 경고 배지 노출
          </span>
        </div>
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
