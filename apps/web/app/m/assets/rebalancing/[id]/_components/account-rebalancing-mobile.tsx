"use client";

import { useMemo, useState } from "react";
import { Divider } from "@seed-design/react";
import { MoneyField } from "@web/components/mobile/money-field";
import type { InvestmentItem } from "@web/features/investments/types/types";
import { stockPriceKey, useStockPrices } from "@web/features/investments/utils/use-stock-prices";
import type { PortfolioItem } from "@web/features/portfolio/types/types";
import { buildAllocationColors } from "@web/features/portfolio/utils/allocation-colors";
import {
  computeActualAllocation,
  type ActualAllocationResult,
} from "@web/features/portfolio/utils/compute-actual-allocation";
import {
  computeDriftAlert,
  type DriftAlert,
} from "@web/features/portfolio/utils/compute-drift-alert";
import {
  computeRebalancingGap,
  type RebalancingAction,
  type RebalancingGapRow,
  type RebalancingSummary,
} from "@web/features/portfolio/utils/compute-rebalancing-gap";
import { sumCash } from "@web/features/portfolio/utils/linked-portfolio-status";
import { cn } from "@web/lib/utils";
import { ActionButton } from "@web/seed-design/ui/action-button";
import { Badge } from "@web/seed-design/ui/badge";
import { List, ListItem } from "@web/seed-design/ui/list";
import { SegmentedControl, SegmentedControlItem } from "@web/seed-design/ui/segmented-control";
import { formatWithCommas, numberToKorean, parseNumericString } from "@web/utils/number-format";

type CashDirection = "in" | "out";

const OTHER_HOLDING_COLOR = "#94a3b8";
const UNALLOCATED_COLOR = "#cbd5e1";
const CASH_COLOR = "#e2e8f0";
const CASH_PRESETS = [
  { label: "+100만", value: 1_000_000 },
  { label: "+500만", value: 5_000_000 },
  { label: "+1000만", value: 10_000_000 },
];

/**
 * 계좌 하나를 대상으로 한 리밸런싱. 포트폴리오가 여러 계좌에 연결돼 있어도 이 계좌의
 * 보유만으로 목표 비중을 맞춘다. 계산은 데스크탑 `PortfolioComparison` 과 같은 util 을
 * 쓰고, 표 대신 종목별 리스트 행으로 보여준다.
 */
export function AccountRebalancingMobile({
  portfolio,
  account,
}: {
  portfolio: PortfolioItem;
  account: InvestmentItem;
}) {
  const holdings = useMemo(() => account.holdings ?? [], [account.holdings]);
  const { prices } = useStockPrices(holdings);

  const [direction, setDirection] = useState<CashDirection>("in");
  const [cashDraft, setCashDraft] = useState("");

  const parsedCash = parseNumericString(cashDraft);
  const cashAmount = Number.isFinite(parsedCash) ? parsedCash : 0;
  const cashDelta = direction === "in" ? cashAmount : -cashAmount;

  const colors = useMemo(
    () => buildAllocationColors(portfolio.allocations.length),
    [portfolio.allocations.length]
  );
  const colorMap = useMemo(() => {
    const m = new Map<string, string>();
    portfolio.allocations.forEach((a, i) =>
      m.set(stockPriceKey(a.market, a.ticker), colors[i] ?? "#3b82f6")
    );
    return m;
  }, [portfolio.allocations, colors]);

  const actual = useMemo(() => computeActualAllocation([account], prices), [account, prices]);
  // 예수금도 리밸런싱 대상 (목표 0원 — 목표 비중대로 모두 투자).
  const cashBalance = useMemo(() => sumCash(account), [account]);
  const summary = useMemo(
    () =>
      computeRebalancingGap(
        portfolio.allocations,
        actual.perStock,
        actual.totalStockValue,
        cashDelta,
        { cashBalance }
      ),
    [portfolio.allocations, actual.perStock, actual.totalStockValue, cashDelta, cashBalance]
  );
  const drift = useMemo(
    () => computeDriftAlert(summary, portfolio.driftThresholdPercent),
    [summary, portfolio.driftThresholdPercent]
  );

  return (
    // 카드 대신 한 장의 표면 위에 섹션을 이어 붙이고 디바이더로 구분한다.
    <div>
      <section className="flex flex-col gap-x3 px-x4 py-x4">
        <h2 className="t5-bold">현금 투입 / 인출</h2>
        <SegmentedControl
          aria-label="현금 방향"
          value={direction}
          onValueChange={(value) => setDirection(value as CashDirection)}
          className="w-full"
        >
          <SegmentedControlItem value="in">투입</SegmentedControlItem>
          <SegmentedControlItem value="out">인출</SegmentedControlItem>
        </SegmentedControl>
        <MoneyField
          label={direction === "in" ? "투입 금액" : "인출 금액"}
          value={cashDraft}
          onValueChange={setCashDraft}
          placeholder="0 (순수 리밸런싱)"
        />
        <div className="flex flex-wrap gap-x2">
          {CASH_PRESETS.map((p) => (
            <ActionButton
              key={p.label}
              variant="neutralWeak"
              size="small"
              onClick={() => setCashDraft((cashAmount + p.value).toLocaleString())}
            >
              {p.label}
            </ActionButton>
          ))}
          {cashAmount > 0 && (
            <ActionButton variant="ghost" size="small" onClick={() => setCashDraft("")}>
              초기화
            </ActionButton>
          )}
        </div>
      </section>

      <Divider />

      <SummaryGrid
        items={[
          { label: "현재 평가액 (예수금 포함)", value: summary.currentBaseValue + cashBalance },
          { label: "시뮬레이션", value: summary.newBaseValue },
          { label: "총 매수", value: summary.totalBuyValue, tone: "buy" },
          { label: "총 매도", value: summary.totalSellValue, tone: "sell" },
        ]}
      />

      <Divider />

      {actual.totalStockValue === 0 && cashBalance === 0 && cashDelta === 0 ? (
        <p className="t4-regular text-fg-neutral-subtle px-x4 py-x6 text-center">
          이 계좌에 보유 종목과 예수금이 없습니다. 종목을 추가하거나 투입 금액을 입력하세요.
        </p>
      ) : (
        <section className="py-x4">
          <div className="flex items-center gap-x2 px-x4 pb-x3">
            <h2 className="t5-bold">권장 매매</h2>
            <div className="ml-auto">
              <DriftBadge drift={drift} />
            </div>
          </div>
          <AllocationBars portfolio={portfolio} colors={colors} actual={actual} summary={summary} />
          <RebalancingRows
            summary={summary}
            colorMap={colorMap}
            thresholdPercent={portfolio.driftThresholdPercent}
          />
        </section>
      )}
    </div>
  );
}

/** 숫자 요약. 배경 타일 없이 2열 그리드로만 나열한다. */
function SummaryGrid({
  items,
}: {
  items: Array<{ label: string; value: number; tone?: "buy" | "sell" }>;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-x4 gap-y-x3 px-x4 py-x4">
      {items.map((item) => (
        <div key={item.label}>
          <p className="t3-regular text-fg-neutral-muted">{item.label}</p>
          <p
            className={cn(
              "t5-bold mt-[2px] tabular-nums",
              item.tone === "buy" && "text-fg-positive",
              item.tone === "sell" && "text-fg-critical"
            )}
          >
            {numberToKorean(item.value) || "0원"}
          </p>
        </div>
      ))}
    </div>
  );
}

function DriftBadge({ drift }: { drift: DriftAlert }) {
  return (
    <Badge tone={drift.hasBreach ? "critical" : "positive"} variant="weak">
      {drift.hasBreach
        ? `이격 초과 ${drift.breachedRows.length}건 · 최대 ${drift.maxAbsGapPercent.toFixed(1)}%`
        : `이격 정상 · 최대 ${drift.maxAbsGapPercent.toFixed(1)}%`}
    </Badge>
  );
}

const ACTION_TONE: Record<RebalancingAction, "positive" | "critical" | "neutral"> = {
  매수: "positive",
  매도: "critical",
  유지: "neutral",
};

function RebalancingRows({
  summary,
  colorMap,
  thresholdPercent,
}: {
  summary: RebalancingSummary;
  colorMap: Map<string, string>;
  thresholdPercent: number;
}) {
  return (
    <List>
      {summary.rows.map((row) => {
        const color = colorMap.get(stockPriceKey(row.market, row.ticker)) ?? OTHER_HOLDING_COLOR;
        const breached = Math.abs(row.gapPercent) > thresholdPercent;
        const gapSign = row.gapPercent > 0 ? "+" : "";
        return (
          <ListItem
            key={row.allocationId}
            prefix={
              <span className="size-[10px] block rounded-full" style={{ backgroundColor: color }} />
            }
            title={row.name || "(미선택)"}
            detail={
              <span className="tabular-nums">
                목표 {row.targetPercent.toFixed(1)}% · 실제 {row.actualPercent.toFixed(1)}% ·{" "}
                <span
                  className={cn(
                    breached && "font-bold",
                    row.gapPercent > 0 && "text-fg-positive",
                    row.gapPercent < 0 && "text-fg-critical"
                  )}
                >
                  {gapSign}
                  {row.gapPercent.toFixed(1)}%
                </span>
              </span>
            }
            suffix={
              <div className="flex flex-col items-end gap-x1">
                <Badge tone={ACTION_TONE[row.action]} variant="solid">
                  {row.action}
                </Badge>
                <span className="t3-medium tabular-nums">
                  {row.gapValue >= 0 ? "+" : "-"}
                  {formatWithCommas(Math.round(Math.abs(row.gapValue)))}원
                </span>
              </div>
            }
          />
        );
      })}
      {summary.cashRow && <CashRow row={summary.cashRow} thresholdPercent={thresholdPercent} />}
    </List>
  );
}

/** 예수금 행: 목표 0원. 사고파는 대상이 아니라 매수 재원으로 보여준다. */
function CashRow({ row, thresholdPercent }: { row: RebalancingGapRow; thresholdPercent: number }) {
  const breached = Math.abs(row.gapPercent) > thresholdPercent;
  return (
    <ListItem
      prefix={
        <span className="size-[10px] block rounded-full" style={{ backgroundColor: CASH_COLOR }} />
      }
      title="예수금"
      detail={
        <span className="tabular-nums">
          목표 0원 · 실제 {row.actualPercent.toFixed(1)}% ·{" "}
          <span className={cn("text-fg-critical", breached && "font-bold")}>
            {row.gapPercent.toFixed(1)}%
          </span>
        </span>
      }
      suffix={
        <div className="flex flex-col items-end gap-x1">
          <Badge tone="neutral" variant="solid">
            매수 재원
          </Badge>
          <span className="t3-medium tabular-nums">
            {formatWithCommas(Math.round(row.actualValue))}원
          </span>
        </div>
      }
    />
  );
}

/** 목표 / 실제 비중을 가로 막대 두 줄로 비교. */
function AllocationBars({
  portfolio,
  colors,
  actual,
  summary,
}: {
  portfolio: PortfolioItem;
  colors: string[];
  actual: ActualAllocationResult;
  summary: RebalancingSummary;
}) {
  const target = [
    ...portfolio.allocations.map((a, i) => ({
      key: a.id,
      color: colors[i] ?? "#3b82f6",
      percent: a.targetPercent,
    })),
    ...(summary.unallocatedPercent > 0
      ? [{ key: "unallocated", color: UNALLOCATED_COLOR, percent: summary.unallocatedPercent }]
      : []),
  ];

  // 실제 막대는 예수금까지 포함한 금액을 기준으로 그린다.
  const cashValue = summary.cashRow?.actualValue ?? 0;
  const base = actual.totalStockValue + cashValue;
  const toPercent = (value: number) => (base > 0 ? (value / base) * 100 : 0);

  let claimed = 0;
  const actualSegments = portfolio.allocations.map((a, i) => {
    const value = actual.perStock.get(stockPriceKey(a.market, a.ticker))?.value ?? 0;
    claimed += value;
    return { key: a.id, color: colors[i] ?? "#3b82f6", percent: toPercent(value) };
  });
  const other = Math.max(0, actual.totalStockValue - claimed);
  if (other > 0) {
    actualSegments.push({ key: "other", color: OTHER_HOLDING_COLOR, percent: toPercent(other) });
  }
  if (cashValue > 0) {
    actualSegments.push({ key: "cash", color: CASH_COLOR, percent: toPercent(cashValue) });
  }

  return (
    <div className="flex flex-col gap-x2 px-x4 pb-x3">
      {[
        { label: "목표", segments: target },
        { label: "실제", segments: actualSegments },
      ].map((bar) => (
        <div key={bar.label} className="flex items-center gap-x2">
          <span className="t3-medium text-fg-neutral-muted w-x8 shrink-0">{bar.label}</span>
          <div className="bg-bg-neutral-weak flex h-x3 flex-1 overflow-hidden rounded-full">
            {bar.segments
              .filter((s) => s.percent > 0)
              .map((s) => (
                <div key={s.key} style={{ width: `${s.percent}%`, backgroundColor: s.color }} />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
