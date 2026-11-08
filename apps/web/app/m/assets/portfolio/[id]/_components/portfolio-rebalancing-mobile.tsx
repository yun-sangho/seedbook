"use client";

import { useMemo, useState } from "react";
import { Divider } from "@seed-design/react";
import { MoneyField } from "@web/components/mobile/money-field";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import type { InvestmentItem } from "@web/features/investments/types/types";
import {
  stockPriceKey,
  useStockPrices,
  type StockPricePoint,
} from "@web/features/investments/utils/use-stock-prices";
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
  type RebalancingSummary,
} from "@web/features/portfolio/utils/compute-rebalancing-gap";
import { resolvePortfolioAccounts } from "@web/features/portfolio/utils/resolve-portfolio-accounts";
import { cn } from "@web/lib/utils";
import { ActionButton } from "@web/seed-design/ui/action-button";
import { Badge } from "@web/seed-design/ui/badge";
import { Callout } from "@web/seed-design/ui/callout";
import { List, ListItem } from "@web/seed-design/ui/list";
import { SegmentedControl, SegmentedControlItem } from "@web/seed-design/ui/segmented-control";
import { formatWithCommas, numberToKorean, parseNumericString } from "@web/utils/number-format";

type ViewMode = "sum" | "per-account";
type CashDirection = "in" | "out";

const OTHER_HOLDING_COLOR = "#94a3b8";
const UNALLOCATED_COLOR = "#cbd5e1";
const CASH_PRESETS = [
  { label: "+100만", value: 1_000_000 },
  { label: "+500만", value: 5_000_000 },
  { label: "+1000만", value: 10_000_000 },
];

/**
 * 모바일 리밸런싱 탭. 계산은 데스크탑 `PortfolioComparison` 과 같은 util 을 쓰고,
 * 표 대신 종목별 리스트 행으로 보여준다.
 */
export function PortfolioRebalancingMobile({ portfolio }: { portfolio: PortfolioItem }) {
  const investments = useInvestmentStore((s) => s.investments);
  const scopedAccounts = useMemo(
    () => resolvePortfolioAccounts(portfolio, investments),
    [portfolio, investments]
  );
  const allHoldings = useMemo(
    () => scopedAccounts.flatMap((inv) => inv.holdings ?? []),
    [scopedAccounts]
  );
  const { prices } = useStockPrices(allHoldings);

  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    scopedAccounts.length >= 2 && portfolio.accountIds.length > 0 ? "per-account" : "sum"
  );
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

  const actual = useMemo(
    () => computeActualAllocation(scopedAccounts, prices),
    [scopedAccounts, prices]
  );
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
  const drift = useMemo(
    () => computeDriftAlert(summary, portfolio.driftThresholdPercent),
    [summary, portfolio.driftThresholdPercent]
  );

  const noLinkedAccounts = portfolio.accountIds.length === 0;
  const perAccountAvailable = !noLinkedAccounts && scopedAccounts.length > 0;
  const effectiveMode: ViewMode = perAccountAvailable ? viewMode : "sum";

  if (noLinkedAccounts) {
    return (
      <div className="px-x4 py-x4">
        <Callout
          tone="warning"
          title="연결된 계좌가 없어요"
          description="설정 탭의 적용 계좌에서 계좌를 선택하면 목표 대비 실제 보유 비교가 표시됩니다."
        />
      </div>
    );
  }

  return (
    // 카드 대신 한 장의 표면 위에 섹션을 이어 붙이고 디바이더로 구분한다.
    <div>
      {scopedAccounts.length === 0 && (
        <div className="px-x4 pt-x4">
          <Callout
            tone="warning"
            description="연결된 계좌가 모두 삭제되었습니다. 설정 탭에서 계좌를 다시 선택하세요."
          />
        </div>
      )}

      {perAccountAvailable && (
        <div className="px-x4 pt-x4">
          <SegmentedControl
            aria-label="계산 범위"
            value={effectiveMode}
            onValueChange={(value) => setViewMode(value as ViewMode)}
            className="w-full"
          >
            <SegmentedControlItem value="sum">전체 합산</SegmentedControlItem>
            <SegmentedControlItem value="per-account">계좌별</SegmentedControlItem>
          </SegmentedControl>
        </div>
      )}

      {effectiveMode === "sum" ? (
        <>
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
              { label: "현재 평가액", value: summary.currentBaseValue },
              { label: "시뮬레이션", value: summary.newBaseValue },
              { label: "총 매수", value: summary.totalBuyValue, tone: "buy" },
              { label: "총 매도", value: summary.totalSellValue, tone: "sell" },
            ]}
          />

          <Divider />

          {actual.totalStockValue === 0 && cashDelta === 0 ? (
            <p className="t4-regular text-fg-neutral-subtle px-x4 py-x6 text-center">
              보유 종목이 없습니다. 투자 계좌에 종목을 추가하거나 투입 금액을 입력하세요.
            </p>
          ) : (
            <section className="py-x4">
              <div className="flex items-center gap-x2 px-x4 pb-x3">
                <h2 className="t5-bold">권장 매매</h2>
                <div className="ml-auto">
                  <DriftBadge drift={drift} />
                </div>
              </div>
              <AllocationBars
                portfolio={portfolio}
                colors={colors}
                actual={actual}
                summary={summary}
              />
              <RebalancingRows
                summary={summary}
                colorMap={colorMap}
                thresholdPercent={portfolio.driftThresholdPercent}
              />
            </section>
          )}
        </>
      ) : (
        <>
          <p className="t3-regular text-fg-neutral-subtle px-x4 py-x3">
            각 계좌는 독립된 리밸런싱 범위로 계산됩니다. 세제계좌 매도 제약 등 계좌 단위 규칙을
            반영하세요.
          </p>
          {scopedAccounts.map((account) => (
            <div key={account.id}>
              <Divider />
              <PerAccountSection
                portfolio={portfolio}
                account={account}
                prices={prices}
                colorMap={colorMap}
              />
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function PerAccountSection({
  portfolio,
  account,
  prices,
  colorMap,
}: {
  portfolio: PortfolioItem;
  account: InvestmentItem;
  prices: Map<string, StockPricePoint>;
  colorMap: Map<string, string>;
}) {
  const actual = useMemo(() => computeActualAllocation([account], prices), [account, prices]);
  // 계좌별 보기는 데스크탑과 같이 현금 시뮬레이션 없이 계산한다.
  const summary = useMemo(
    () => computeRebalancingGap(portfolio.allocations, actual.perStock, actual.totalStockValue, 0),
    [portfolio.allocations, actual.perStock, actual.totalStockValue]
  );
  const drift = useMemo(
    () => computeDriftAlert(summary, portfolio.driftThresholdPercent),
    [summary, portfolio.driftThresholdPercent]
  );

  return (
    <section className="py-x4">
      <div className="flex items-center gap-x3 px-x4 pb-x3">
        <span
          className="size-x3 shrink-0 rounded-full"
          style={{ backgroundColor: account.color }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="t5-bold truncate">{account.accountName}</p>
          <p className="t3-regular text-fg-neutral-subtle tabular-nums">
            {account.accountType} · 평가액 {numberToKorean(actual.totalStockValue) || "0원"}
          </p>
        </div>
        <DriftBadge drift={drift} />
      </div>
      {actual.totalStockValue === 0 ? (
        <p className="t3-regular text-fg-neutral-subtle px-x4">
          이 계좌에는 가격 조회 가능한 보유 종목이 없습니다.
        </p>
      ) : (
        <>
          <SummaryGrid
            items={[
              { label: "총 매수", value: summary.totalBuyValue, tone: "buy" },
              { label: "총 매도", value: summary.totalSellValue, tone: "sell" },
            ]}
          />
          <RebalancingRows
            summary={summary}
            colorMap={colorMap}
            thresholdPercent={portfolio.driftThresholdPercent}
          />
        </>
      )}
    </section>
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
    </List>
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

  let claimed = 0;
  const actualSegments = portfolio.allocations.map((a, i) => {
    const value = actual.perStock.get(stockPriceKey(a.market, a.ticker))?.value ?? 0;
    claimed += value;
    return {
      key: a.id,
      color: colors[i] ?? "#3b82f6",
      percent: actual.totalStockValue > 0 ? (value / actual.totalStockValue) * 100 : 0,
    };
  });
  const other = Math.max(0, actual.totalStockValue - claimed);
  if (other > 0) {
    actualSegments.push({
      key: "other",
      color: OTHER_HOLDING_COLOR,
      percent: (other / actual.totalStockValue) * 100,
    });
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
