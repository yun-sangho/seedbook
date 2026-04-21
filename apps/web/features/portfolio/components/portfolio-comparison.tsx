"use client";

import { useMemo, useState } from "react";
import { Button } from "@web/components/ui/button";
import { Input } from "@web/components/ui/input";
import { Label } from "@web/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@web/components/ui/table";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { ACCOUNT_COLORS, COLOR_FAMILIES } from "@web/features/investments/types/constants";
import { stockPriceKey, useStockPrices } from "@web/features/investments/utils/use-stock-prices";
import { cn } from "@web/lib/utils";
import { getNextColor } from "@web/utils/color-selection";
import { formatWithCommas, numberToKorean, parseNumericString } from "@web/utils/number-format";
import { Minus, Plus } from "lucide-react";
import type { PortfolioItem } from "../types/types";
import { computeActualAllocation } from "../utils/compute-actual-allocation";
import { computeRebalancingGap } from "../utils/compute-rebalancing-gap";

interface PortfolioComparisonProps {
  portfolio: PortfolioItem;
}

/**
 * Allocations 길이만큼 색상을 생성한다. `getNextColor` 를 누적 호출해
 * 인접한 종목이 다른 색상 계열에서 뽑히도록 한다 (인덱스 단순 mod 보다
 * 시각 구분이 훨씬 잘 됨).
 */
function buildAllocationColors(count: number): string[] {
  const used: string[] = [];
  const colors: string[] = [];
  for (let i = 0; i < count; i++) {
    const c = getNextColor(used, ACCOUNT_COLORS, COLOR_FAMILIES);
    used.push(c);
    colors.push(c);
  }
  return colors;
}

export function PortfolioComparison({ portfolio }: PortfolioComparisonProps) {
  const investments = useInvestmentStore((s) => s.investments);

  // 모든 보유 종목의 가격을 받아온다 — 포트폴리오 외 종목도 포함해야
  // totalStockValue 가 정확히 계산된다.
  const allHoldings = useMemo(
    () => investments.flatMap((inv) => inv.holdings ?? []),
    [investments]
  );
  const { prices } = useStockPrices(allHoldings);

  const actual = useMemo(() => computeActualAllocation(investments, prices), [investments, prices]);

  const [cashDelta, setCashDelta] = useState(0);
  const [cashDeltaInput, setCashDeltaInput] = useState("");

  const summary = useMemo(
    () =>
      computeRebalancingGap(
        portfolio.allocations,
        actual.perStock,
        actual.totalStockValue,
        cashDelta
      ),
    [portfolio.allocations, actual.perStock, actual.totalStockValue, cashDelta]
  );

  // 종목별 색상 — getNextColor 로 계열이 분산되도록 미리 계산
  const allocationColors = useMemo(
    () => buildAllocationColors(portfolio.allocations.length),
    [portfolio.allocations.length]
  );
  const colorMap = useMemo(() => {
    const m = new Map<string, string>();
    portfolio.allocations.forEach((a, i) => {
      m.set(`${a.market}:${a.ticker}`, allocationColors[i] ?? "#3b82f6");
    });
    return m;
  }, [portfolio.allocations, allocationColors]);

  // 실제 보유 비중 막대 — allocations 순서로 표시 + 미분류 보유분
  const actualBarSegments = useMemo(() => {
    const segments: Array<{ label: string; color: string; value: number; percent: number }> = [];
    let claimed = 0;
    portfolio.allocations.forEach((a, i) => {
      const key = stockPriceKey(a.market, a.ticker);
      const v = actual.perStock.get(key)?.value ?? 0;
      claimed += v;
      segments.push({
        label: a.name || `행 ${i + 1}`,
        color: allocationColors[i] ?? "#3b82f6",
        value: v,
        percent: actual.totalStockValue > 0 ? (v / actual.totalStockValue) * 100 : 0,
      });
    });
    const other = Math.max(0, actual.totalStockValue - claimed);
    if (other > 0) {
      segments.push({
        label: "기타 보유",
        color: "#94a3b8",
        value: other,
        percent: actual.totalStockValue > 0 ? (other / actual.totalStockValue) * 100 : 0,
      });
    }
    return segments;
  }, [portfolio.allocations, actual]);

  const handleCashDeltaCommit = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed === "-") {
      setCashDelta(0);
      return;
    }
    const num = parseNumericString(trimmed);
    setCashDelta(Number.isFinite(num) ? num : 0);
  };

  const presets: Array<{ label: string; value: number }> = [
    { label: "0", value: 0 },
    { label: "+100만원", value: 1000000 },
    { label: "+1000만원", value: 10000000 },
    { label: "-100만원", value: -1000000 },
  ];

  const isEmptyState = actual.totalStockValue === 0 && cashDelta === 0;

  return (
    <div className="space-y-6 px-4 py-5 border-t bg-muted/20">
      <div>
        <h4 className="text-sm font-semibold mb-1">목표 대비 실제 보유</h4>
        <p className="text-xs text-muted-foreground">
          현재 보유 종목은 모든 투자 계좌의 합계로 계산됩니다.
        </p>
      </div>

      {/* 현금 시뮬레이션 컨트롤 */}
      <div className="rounded-lg border bg-background p-4">
        <Label htmlFor={`cash-delta-${portfolio.id}`} className="text-sm">
          현금 추가 / 인출
          <span className="text-xs text-muted-foreground ml-2">
            양수=투입, 음수=인출, 0=순수 리밸런싱
          </span>
        </Label>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="100만원 빼기"
              onClick={() => {
                const next = cashDelta - 1000000;
                setCashDelta(next);
                setCashDeltaInput(String(next));
              }}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <Input
              id={`cash-delta-${portfolio.id}`}
              type="text"
              inputMode="numeric"
              className="w-44 text-right tabular-nums"
              placeholder="0"
              value={cashDeltaInput}
              onChange={(e) => setCashDeltaInput(e.target.value)}
              onBlur={(e) => handleCashDeltaCommit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCashDeltaCommit((e.target as HTMLInputElement).value);
                }
              }}
            />
            <span className="text-sm text-muted-foreground">원</span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="100만원 더하기"
              onClick={() => {
                const next = cashDelta + 1000000;
                setCashDelta(next);
                setCashDeltaInput(String(next));
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <Button
                key={p.label}
                type="button"
                variant={cashDelta === p.value ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setCashDelta(p.value);
                  setCashDeltaInput(p.value === 0 ? "" : String(p.value));
                }}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>
        {cashDelta !== 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {cashDelta > 0 ? "투입" : "인출"}: {numberToKorean(Math.abs(cashDelta))}
          </p>
        )}
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="현재 평가액" value={summary.currentBaseValue} />
        <SummaryCard label="시뮬레이션 평가액" value={summary.newBaseValue} highlight />
        <SummaryCard label="총 매수" value={summary.totalBuyValue} tone="buy" />
        <SummaryCard label="총 매도" value={summary.totalSellValue} tone="sell" />
      </div>

      {isEmptyState ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          보유 종목이 없습니다. 투자 계좌에 종목을 추가하거나 위에서 투입 금액을 입력하세요.
        </div>
      ) : (
        <>
          {/* 목표 vs 실제 막대 비교 */}
          <div className="space-y-3">
            <BarRow
              label="목표"
              segments={[
                ...portfolio.allocations.map((a, i) => ({
                  label: a.name || `행 ${i + 1}`,
                  color: allocationColors[i] ?? "#3b82f6",
                  percent: a.targetPercent,
                })),
                ...(summary.unallocatedPercent > 0
                  ? [
                      {
                        label: "미배정 / 현금",
                        color: "#cbd5e1",
                        percent: summary.unallocatedPercent,
                      },
                    ]
                  : []),
              ]}
            />
            <BarRow
              label="실제"
              segments={actualBarSegments.map((s) => ({
                label: s.label,
                color: s.color,
                percent: s.percent,
              }))}
            />
          </div>

          {/* 권장 액션 테이블 */}
          <div className="rounded-lg border bg-background overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>종목</TableHead>
                  <TableHead className="text-right">목표 %</TableHead>
                  <TableHead className="text-right">실제 %</TableHead>
                  <TableHead className="text-right">차이 %</TableHead>
                  <TableHead className="text-right">차이 금액</TableHead>
                  <TableHead className="text-center">권장</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.rows.map((row) => {
                  const color = colorMap.get(`${row.market}:${row.ticker}`) ?? "#94a3b8";
                  return (
                    <TableRow key={row.allocationId}>
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: color }}
                          />
                          <span className="truncate font-medium">{row.name || "(미선택)"}</span>
                          {row.market && row.ticker && (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground flex-shrink-0">
                              {row.market} · {row.ticker}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.targetPercent.toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.actualPercent.toFixed(1)}%
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums",
                          row.gapPercent > 0
                            ? "text-emerald-600"
                            : row.gapPercent < 0
                              ? "text-destructive"
                              : ""
                        )}
                      >
                        {row.gapPercent > 0 ? "+" : ""}
                        {row.gapPercent.toFixed(1)}%
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums",
                          row.gapValue > 0
                            ? "text-emerald-600"
                            : row.gapValue < 0
                              ? "text-destructive"
                              : ""
                        )}
                      >
                        {row.gapValue >= 0 ? "+" : "-"}
                        {formatWithCommas(Math.round(Math.abs(row.gapValue)))}원
                      </TableCell>
                      <TableCell className="text-center">
                        <ActionBadge action={row.action} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  highlight,
}: {
  label: string;
  value: number;
  tone?: "buy" | "sell";
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-background p-3",
        highlight && "border-primary/40 bg-primary/5"
      )}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 text-base font-semibold tabular-nums",
          tone === "buy" && "text-emerald-600",
          tone === "sell" && "text-destructive"
        )}
      >
        {numberToKorean(value) || "0원"}
      </div>
    </div>
  );
}

function BarRow({
  label,
  segments,
}: {
  label: string;
  segments: Array<{ label: string; color: string; percent: number }>;
}) {
  const totalPct = segments.reduce((acc, s) => acc + s.percent, 0);
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{totalPct.toFixed(1)}%</span>
      </div>
      <div className="flex h-7 w-full overflow-hidden rounded-md border bg-muted">
        {segments.map((s, i) => (
          <div
            key={`${s.label}-${i}`}
            title={`${s.label}: ${s.percent.toFixed(1)}%`}
            className="h-full transition-all"
            style={{ width: `${s.percent}%`, backgroundColor: s.color }}
          />
        ))}
      </div>
    </div>
  );
}

function ActionBadge({ action }: { action: "매수" | "매도" | "유지" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        action === "매수" &&
          "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
        action === "매도" && "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
        action === "유지" && "bg-muted text-muted-foreground"
      )}
    >
      {action}
    </span>
  );
}
