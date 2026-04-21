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
import type { InvestmentItem } from "@web/features/investments/types/types";
import {
  stockPriceKey,
  useStockPrices,
  type StockPricePoint,
} from "@web/features/investments/utils/use-stock-prices";
import { cn } from "@web/lib/utils";
import { getNextColor } from "@web/utils/color-selection";
import { formatWithCommas, numberToKorean, parseNumericString } from "@web/utils/number-format";
import { AlertTriangle, CheckCircle2, Minus, Plus } from "lucide-react";
import type { PortfolioItem } from "../types/types";
import {
  computeActualAllocation,
  type ActualAllocationResult,
} from "../utils/compute-actual-allocation";
import { computeDriftAlert, type DriftAlert } from "../utils/compute-drift-alert";
import {
  computeRebalancingGap,
  type RebalancingSummary,
} from "../utils/compute-rebalancing-gap";
import { resolvePortfolioAccounts } from "../utils/resolve-portfolio-accounts";

interface PortfolioComparisonProps {
  portfolio: PortfolioItem;
}

type ViewMode = "sum" | "per-account";

/**
 * Allocations 길이만큼 색상을 생성한다. `getNextColor` 를 누적 호출해
 * 인접한 종목이 다른 색상 계열에서 뽑히도록 한다.
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
  const scopedAccounts = useMemo(
    () => resolvePortfolioAccounts(portfolio, investments),
    [portfolio, investments]
  );

  // 모든 보유 종목의 가격을 받아온다 — 필터된 계좌의 holdings 만 보낸다.
  const allHoldings = useMemo(
    () => scopedAccounts.flatMap((inv) => inv.holdings ?? []),
    [scopedAccounts]
  );
  const { prices } = useStockPrices(allHoldings);

  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    scopedAccounts.length >= 2 && portfolio.accountIds.length > 0 ? "per-account" : "sum"
  );
  const [cashDelta, setCashDelta] = useState(0);
  const [cashDeltaInput, setCashDeltaInput] = useState("");

  const perAccountAvailable = portfolio.accountIds.length > 0 && scopedAccounts.length > 0;
  const effectiveMode: ViewMode = perAccountAvailable ? viewMode : "sum";

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

  // 전체 합산 뷰
  const sumActual = useMemo(
    () => computeActualAllocation(scopedAccounts, prices),
    [scopedAccounts, prices]
  );
  const sumSummary = useMemo(
    () =>
      computeRebalancingGap(
        portfolio.allocations,
        sumActual.perStock,
        sumActual.totalStockValue,
        cashDelta
      ),
    [portfolio.allocations, sumActual.perStock, sumActual.totalStockValue, cashDelta]
  );
  const sumDrift = useMemo(
    () => computeDriftAlert(sumSummary, portfolio.driftThresholdPercent),
    [sumSummary, portfolio.driftThresholdPercent]
  );

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

  const scopeLabel =
    portfolio.accountIds.length === 0
      ? "모든 투자 계좌 합계"
      : `연결된 ${scopedAccounts.length}개 계좌 합계`;

  return (
    <div className="space-y-6 px-4 py-5 border-t bg-muted/20">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h4 className="text-sm font-semibold mb-1">목표 대비 실제 보유</h4>
          <p className="text-xs text-muted-foreground">{scopeLabel} 기준으로 계산됩니다.</p>
        </div>
        {perAccountAvailable && (
          <div className="inline-flex rounded-md border bg-background p-0.5">
            <ViewToggleButton
              active={effectiveMode === "sum"}
              onClick={() => setViewMode("sum")}
            >
              전체 합산
            </ViewToggleButton>
            <ViewToggleButton
              active={effectiveMode === "per-account"}
              onClick={() => setViewMode("per-account")}
            >
              계좌별
            </ViewToggleButton>
          </div>
        )}
      </div>

      {portfolio.accountIds.length > 0 && scopedAccounts.length === 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-3 text-xs text-amber-800 dark:text-amber-200">
          연결된 계좌가 모두 삭제되었습니다. 포트폴리오 편집에서 계좌를 다시 선택하거나 연결을
          해제하세요.
        </div>
      )}

      {effectiveMode === "sum" ? (
        <SumView
          portfolio={portfolio}
          allocationColors={allocationColors}
          colorMap={colorMap}
          actual={sumActual}
          summary={sumSummary}
          drift={sumDrift}
          cashDelta={cashDelta}
          cashDeltaInput={cashDeltaInput}
          onCashDeltaChange={(v) => setCashDeltaInput(v)}
          onCashDeltaCommit={(v) => handleCashDeltaCommit(v)}
          onCashDeltaSet={(value) => {
            setCashDelta(value);
            setCashDeltaInput(value === 0 ? "" : String(value));
          }}
          presets={presets}
        />
      ) : (
        <PerAccountView
          portfolio={portfolio}
          accounts={scopedAccounts}
          prices={prices}
          colorMap={colorMap}
        />
      )}
    </div>
  );
}

function ViewToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-1 text-xs font-medium rounded transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
      )}
    >
      {children}
    </button>
  );
}

// ─── Sum view ────────────────────────────────────────────────────────────────

interface SumViewProps {
  portfolio: PortfolioItem;
  allocationColors: string[];
  colorMap: Map<string, string>;
  actual: ActualAllocationResult;
  summary: RebalancingSummary;
  drift: DriftAlert;
  cashDelta: number;
  cashDeltaInput: string;
  onCashDeltaChange: (v: string) => void;
  onCashDeltaCommit: (v: string) => void;
  onCashDeltaSet: (value: number) => void;
  presets: Array<{ label: string; value: number }>;
}

function SumView({
  portfolio,
  allocationColors,
  colorMap,
  actual,
  summary,
  drift,
  cashDelta,
  cashDeltaInput,
  onCashDeltaChange,
  onCashDeltaCommit,
  onCashDeltaSet,
  presets,
}: SumViewProps) {
  const isEmptyState = actual.totalStockValue === 0 && cashDelta === 0;

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
  }, [portfolio.allocations, actual, allocationColors]);

  return (
    <>
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
              onClick={() => onCashDeltaSet(cashDelta - 1000000)}
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
              onChange={(e) => onCashDeltaChange(e.target.value)}
              onBlur={(e) => onCashDeltaCommit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onCashDeltaCommit((e.target as HTMLInputElement).value);
                }
              }}
            />
            <span className="text-sm text-muted-foreground">원</span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="100만원 더하기"
              onClick={() => onCashDeltaSet(cashDelta + 1000000)}
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
                onClick={() => onCashDeltaSet(p.value)}
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

      {/* 요약 카드 + 이격률 배지 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DriftBadge drift={drift} thresholdPercent={portfolio.driftThresholdPercent} />
      </div>
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
          <RebalancingTable
            summary={summary}
            colorMap={colorMap}
            thresholdPercent={portfolio.driftThresholdPercent}
          />
        </>
      )}
    </>
  );
}

// ─── Per-account view ────────────────────────────────────────────────────────

interface PerAccountViewProps {
  portfolio: PortfolioItem;
  accounts: InvestmentItem[];
  prices: Map<string, StockPricePoint>;
  colorMap: Map<string, string>;
}

function PerAccountView({ portfolio, accounts, prices, colorMap }: PerAccountViewProps) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        각 계좌는 독립된 리밸런싱 범위로 계산됩니다. 세제계좌 매도 제약 등 계좌 단위 규칙을
        반영하세요.
      </p>
      {accounts.map((account) => (
        <PerAccountCard
          key={account.id}
          portfolio={portfolio}
          account={account}
          prices={prices}
          colorMap={colorMap}
        />
      ))}
    </div>
  );
}

interface PerAccountCardProps {
  portfolio: PortfolioItem;
  account: InvestmentItem;
  prices: Map<string, StockPricePoint>;
  colorMap: Map<string, string>;
}

function PerAccountCard({
  portfolio,
  account,
  prices,
  colorMap,
}: PerAccountCardProps) {
  const actual = useMemo(() => computeActualAllocation([account], prices), [account, prices]);
  const summary = useMemo(
    () =>
      computeRebalancingGap(
        portfolio.allocations,
        actual.perStock,
        actual.totalStockValue,
        0 // 계좌별 뷰는 cashDelta 미지원 (단순화)
      ),
    [portfolio.allocations, actual.perStock, actual.totalStockValue]
  );
  const drift = useMemo(
    () => computeDriftAlert(summary, portfolio.driftThresholdPercent),
    [summary, portfolio.driftThresholdPercent]
  );

  return (
    <div className="rounded-lg border bg-background overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-muted/30">
        <span
          className="h-2.5 w-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: account.color }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h5 className="font-medium truncate">{account.accountName}</h5>
            {account.accountType && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground flex-shrink-0">
                {account.accountType}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
            평가액 {numberToKorean(actual.totalStockValue) || "0원"}
          </p>
        </div>
        <DriftBadge drift={drift} thresholdPercent={portfolio.driftThresholdPercent} compact />
      </div>

      {actual.totalStockValue === 0 ? (
        <div className="p-4 text-center text-xs text-muted-foreground">
          이 계좌에는 가격 조회 가능한 보유 종목이 없습니다.
        </div>
      ) : (
        <>
          <div className="p-4 grid grid-cols-2 gap-3">
            <SummaryCard label="총 매수" value={summary.totalBuyValue} tone="buy" />
            <SummaryCard label="총 매도" value={summary.totalSellValue} tone="sell" />
          </div>
          <RebalancingTable
            summary={summary}
            colorMap={colorMap}
            thresholdPercent={portfolio.driftThresholdPercent}
            dense
          />
        </>
      )}
    </div>
  );
}

// ─── Shared sub-components ───────────────────────────────────────────────────

function DriftBadge({
  drift,
  thresholdPercent,
  compact,
}: {
  drift: DriftAlert;
  thresholdPercent: number;
  compact?: boolean;
}) {
  const base = cn(
    "inline-flex items-center gap-1.5 rounded-full font-medium",
    compact ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
    drift.hasBreach
      ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
      : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
  );
  return (
    <span className={base} title={`임계 ${thresholdPercent}% | 최대 |gap| ${drift.maxAbsGapPercent.toFixed(1)}%`}>
      {drift.hasBreach ? (
        <AlertTriangle className="h-3.5 w-3.5" />
      ) : (
        <CheckCircle2 className="h-3.5 w-3.5" />
      )}
      {drift.hasBreach
        ? `이격 초과 ${drift.breachedRows.length}건 (최대 ${drift.maxAbsGapPercent.toFixed(1)}%)`
        : `이격 정상 (최대 ${drift.maxAbsGapPercent.toFixed(1)}%)`}
    </span>
  );
}

function RebalancingTable({
  summary,
  colorMap,
  thresholdPercent,
  dense,
}: {
  summary: RebalancingSummary;
  colorMap: Map<string, string>;
  thresholdPercent: number;
  dense?: boolean;
}) {
  return (
    <div className={cn("border-t bg-background overflow-x-auto", !dense && "rounded-lg border")}>
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
            const breached = Math.abs(row.gapPercent) > thresholdPercent;
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
                    breached && "font-semibold",
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
