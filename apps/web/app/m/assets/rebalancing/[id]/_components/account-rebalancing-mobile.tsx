"use client";

import { useMemo, useState } from "react";
import { Divider } from "@seed-design/react";
import { useFlow } from "@stackflow/react";
import { MoneyField } from "@web/components/mobile/money-field";
import { PriceAsOfBanner } from "@web/components/mobile/price-as-of-banner";
import type { InvestmentItem, StockHolding } from "@web/features/investments/types/types";
import { stockPriceKey, useStockPrices } from "@web/features/investments/utils/use-stock-prices";
import type { PortfolioItem } from "@web/features/portfolio/types/types";
import { buildAllocationColors } from "@web/features/portfolio/utils/allocation-colors";
import { computeActualAllocation } from "@web/features/portfolio/utils/compute-actual-allocation";
import {
  computeDriftAlert,
  type DriftAlert,
} from "@web/features/portfolio/utils/compute-drift-alert";
import {
  computeRebalancingGap,
  portfolioStockValue,
  type RebalancingGapRow,
  type RebalancingSummary,
} from "@web/features/portfolio/utils/compute-rebalancing-gap";
import { driftPercent, formatDriftPercent } from "@web/features/portfolio/utils/drift-percent";
import { sumCash } from "@web/features/portfolio/utils/linked-portfolio-status";
import { OutsideHoldingsNotice } from "@web/features/rebalancing/components/outside-holdings-notice";
import { useRebalancingStore } from "@web/features/rebalancing/stores/rebalancing-store";
import type { RebalancingTask } from "@web/features/rebalancing/types/types";
import { buildRebalancingTasks } from "@web/features/rebalancing/utils/build-rebalancing-tasks";
import { holdingsOutsidePortfolio } from "@web/features/rebalancing/utils/holdings-outside-portfolio";
import { findInProgressForAccount } from "@web/features/rebalancing/utils/rebalancing-session";
import { cn } from "@web/lib/utils";
import { ActionButton } from "@web/seed-design/ui/action-button";
import { Badge } from "@web/seed-design/ui/badge";
import { List, ListItem } from "@web/seed-design/ui/list";
import { SegmentedControl, SegmentedControlItem } from "@web/seed-design/ui/segmented-control";
import { formatWithCommas, numberToKorean, parseNumericString } from "@web/utils/number-format";

type CashDirection = "in" | "out";

const OTHER_HOLDING_COLOR = "#94a3b8";
const CASH_COLOR = "#e2e8f0";

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
  const outsideHoldings = useMemo(
    () => holdingsOutsidePortfolio(account, portfolio, prices),
    [account, portfolio, prices]
  );
  // 아직 보유하지 않은 목표 종목도 할 일의 예상 수량을 적으려면 시세가 필요하다.
  const allocationHoldings = useMemo(
    () => portfolio.allocations.map(allocationAsHolding),
    [portfolio.allocations]
  );
  const { prices: allocationPrices, isLoading: allocationPricesLoading } =
    useStockPrices(allocationHoldings);

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
        // 기준 금액은 포트폴리오 종목만 — 목표에 없는 보유 종목은 리밸런싱에서 제외한다.
        portfolioStockValue(portfolio.allocations, actual.perStock),
        cashDelta,
        { cashBalance }
      ),
    [portfolio.allocations, actual.perStock, cashDelta, cashBalance]
  );
  // 권장 매매 목록과 "리밸런싱 시작" 이 같은 스냅샷을 쓰도록 여기서 한 번 만든다.
  const tasks = useMemo(
    () => buildRebalancingTasks(summary, allocationPrices),
    [summary, allocationPrices]
  );
  const isEmpty = actual.totalStockValue === 0 && cashBalance === 0 && cashDelta === 0;
  const drift = useMemo(
    () => computeDriftAlert(summary, portfolio.driftThresholdPercent),
    [summary, portfolio.driftThresholdPercent]
  );

  return (
    // 카드 대신 한 장의 표면 위에 섹션을 이어 붙이고 디바이더로 구분한다.
    <div>
      <PriceAsOfBanner prices={prices} />
      {/* 목표에 없는 종목은 리밸런싱으로 맞출 수 없다 — 시작 전에 정리하도록 막는다. */}
      {outsideHoldings.length > 0 && (
        <div className="px-x4 pt-x4">
          <OutsideHoldingsNotice holdings={outsideHoldings} blocking />
        </div>
      )}
      <section className="flex flex-col gap-x3 px-x4 py-x4">
        {/* 방향 선택을 제목 줄에 붙이고 입력 라벨을 생략해 세로 공간을 줄인다. */}
        <div className="flex items-center gap-x2">
          <h2 className="t5-bold flex-1">현금 투입 / 인출</h2>
          <SegmentedControl
            aria-label="현금 방향"
            value={direction}
            onValueChange={(value) => setDirection(value as CashDirection)}
          >
            <SegmentedControlItem value="in">투입</SegmentedControlItem>
            <SegmentedControlItem value="out">인출</SegmentedControlItem>
          </SegmentedControl>
        </div>
        <MoneyField
          ariaLabel={direction === "in" ? "투입 금액" : "인출 금액"}
          value={cashDraft}
          onValueChange={setCashDraft}
          placeholder="0 (순수 리밸런싱)"
          clearable
        />
      </section>

      <Divider />

      <SummaryGrid
        items={[
          { label: "현재 평가액 (예수금 포함)", value: summary.currentBaseValue + cashBalance },
        ]}
      />
      {!isEmpty && (
        <div className="pb-x4">
          <DriftRows
            drift={drift}
            summary={summary}
            colorMap={colorMap}
            thresholdPercent={portfolio.driftThresholdPercent}
          />
        </div>
      )}

      <Divider />

      {isEmpty ? (
        <p className="t4-regular text-fg-neutral-subtle px-x4 py-x6 text-center">
          이 계좌에 보유 종목과 예수금이 없습니다. 종목을 추가하거나 투입 금액을 입력하세요.
        </p>
      ) : (
        <section className="py-x4">
          <div className="flex items-center gap-x2 px-x4 pb-x3">
            <h2 className="t5-bold">권장 매매</h2>
          </div>
          <SummaryGrid
            className="pt-0"
            items={[
              { label: "총 매수", value: summary.totalBuyValue, tone: "buy" },
              { label: "총 매도", value: summary.totalSellValue, tone: "sell" },
            ]}
          />
          <TradeRows tasks={tasks} colorMap={colorMap} />
        </section>
      )}

      <Divider />

      <StartRebalancingSection
        account={account}
        portfolio={portfolio}
        summary={summary}
        tasks={tasks}
        pricesLoading={allocationPricesLoading}
        hasOutsideHoldings={outsideHoldings.length > 0}
      />
    </div>
  );
}

function allocationAsHolding(a: PortfolioItem["allocations"][number]): StockHolding {
  return {
    id: a.id,
    market: a.market,
    ticker: a.ticker,
    name: a.name,
    currency: a.currency,
    quantity: 0,
    memo: "",
  };
}

/**
 * 지금 계산된 권장 매매를 할 일 목록으로 만들어 리밸런싱을 시작한다. 계좌에 진행 중인
 * 리밸런싱이 있으면 새로 만들지 않고 그쪽으로 보낸다 (한 계좌에 하나씩).
 */
function StartRebalancingSection({
  account,
  portfolio,
  summary,
  tasks,
  pricesLoading,
  hasOutsideHoldings,
}: {
  account: InvestmentItem;
  portfolio: PortfolioItem;
  summary: RebalancingSummary;
  tasks: RebalancingTask[];
  /** 시세를 받는 중이면 시작을 막는다 — 가격·기준 시각 없이 할 일이 스냅샷되지 않도록. */
  pricesLoading: boolean;
  /** 계좌에 포트폴리오에 없는 종목이 있으면 시작을 막는다. */
  hasOutsideHoldings: boolean;
}) {
  const inProgress = useRebalancingStore((s) => findInProgressForAccount(s.sessions, account.id));
  const startRebalancing = useRebalancingStore((s) => s.startRebalancing);
  const { replace } = useFlow();

  const disabledReason = startDisabledReason(tasks, pricesLoading, hasOutsideHoldings);

  if (inProgress) {
    return (
      <section className="flex flex-col gap-x2 px-x4 py-x4">
        <p className="t3-regular text-fg-neutral-subtle">
          이 계좌에 진행 중인 리밸런싱이 있어요. 먼저 마치거나 삭제한 뒤 새로 시작할 수 있어요.
        </p>
        <ActionButton
          size="large"
          variant="neutralWeak"
          className="w-full"
          onClick={() => replace("RebalancingSession", { id: inProgress.id })}
        >
          진행 중인 리밸런싱 보기
        </ActionButton>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-x2 px-x4 py-x4">
      {disabledReason && <p className="t3-regular text-fg-neutral-subtle">{disabledReason}</p>}
      <ActionButton
        size="large"
        className="w-full"
        disabled={disabledReason !== null}
        onClick={() => {
          const id = startRebalancing({
            accountId: account.id,
            accountName: account.accountName,
            portfolioId: portfolio.id,
            portfolioName: portfolio.name,
            cashDelta: summary.cashDelta,
            tasks,
          });
          // 계산 화면은 스택에서 빼고 할 일 목록으로 바꾼다.
          replace("RebalancingSession", { id });
        }}
      >
        리밸런싱 시작
      </ActionButton>
    </section>
  );
}

/** 시작 버튼을 막는 이유. 시작할 수 있으면 null. */
function startDisabledReason(
  tasks: RebalancingTask[],
  pricesLoading: boolean,
  hasOutsideHoldings: boolean
): string | null {
  if (hasOutsideHoldings) return "포트폴리오에 없는 종목을 정리한 뒤 시작할 수 있어요.";
  if (pricesLoading) return "시세를 불러오는 중이에요.";
  if (tasks.length === 0) return "지금은 사고팔 종목이 없어요.";
  return null;
}

/**
 * "목표 30.0% · 현재 36.2% · 이격 +6.2%". 이격률은 현재 − 목표 (목표보다 많으면 +).
 * 부호와 상관없이 경고 색으로 보여주고, 이격 기준을 넘으면 굵게.
 */
function PercentLine({
  row,
  thresholdPercent,
}: {
  row: RebalancingGapRow;
  thresholdPercent: number;
}) {
  const drift = driftPercent(row);
  return (
    <span className="tabular-nums">
      목표 {row.targetPercent.toFixed(1)}% · 현재 {row.actualPercent.toFixed(1)}% · 이격{" "}
      <span className={cn("text-fg-warning", Math.abs(drift) > thresholdPercent && "font-bold")}>
        {formatDriftPercent(drift)}
      </span>
    </span>
  );
}

/**
 * 현재 평가액 아래 종목 목록. 기본은 이격 기준을 넘은 종목만, "모든 종목 보기" 를 누르면
 * 포트폴리오의 모든 종목과 예수금을 목표 · 현재 · 이격과 함께 보여준다.
 */
function DriftRows({
  drift,
  summary,
  colorMap,
  thresholdPercent,
}: {
  drift: DriftAlert;
  summary: RebalancingSummary;
  colorMap: Map<string, string>;
  thresholdPercent: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const cashRow = summary.cashRow;
  const allRows = cashRow ? [...summary.rows, cashRow] : summary.rows;
  const rows = showAll ? allRows : drift.breachedRows;

  return (
    <div className="flex flex-col gap-x2 px-x4">
      <div className="flex items-center gap-x2">
        <p className="t3-regular text-fg-neutral-subtle flex-1">
          {showAll ? "모든 종목" : `이격 기준(${thresholdPercent}%)을 넘은 종목`}
        </p>
        <ActionButton
          variant="ghost"
          size="small"
          bleedX="asPadding"
          aria-expanded={showAll}
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? "기준 넘은 종목만" : "모든 종목 보기"}
        </ActionButton>
      </div>
      {rows.length === 0 ? (
        <p className="t3-regular text-fg-neutral-subtle">모든 종목이 이격 기준 안에 있어요.</p>
      ) : (
        <ul className="flex flex-col gap-x3">
          {rows.map((row) => {
            const isCash = row === cashRow;
            const color = isCash
              ? CASH_COLOR
              : (colorMap.get(stockPriceKey(row.market, row.ticker)) ?? OTHER_HOLDING_COLOR);
            return (
              <li key={row.allocationId} className="flex items-start gap-x2">
                <span
                  className="size-[10px] mt-[6px] block shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <div className="min-w-0 flex-1">
                  <p className="t4-regular truncate">
                    {isCash ? "예수금" : row.name || "(미선택)"}
                  </p>
                  <p className="t3-regular text-fg-neutral-subtle">
                    <PercentLine row={row} thresholdPercent={thresholdPercent} />
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** 숫자 요약. 배경 타일 없이 2열 그리드로만 나열한다. */
function SummaryGrid({
  items,
  className,
}: {
  items: Array<{ label: string; value: number; tone?: "buy" | "sell" }>;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-2 gap-x-x4 gap-y-x3 px-x4 py-x4", className)}>
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

/**
 * 권장 매매: 사고팔 종목마다 예상 수량과 금액만 보여준다 (매도 → 매수, 금액 큰 순).
 * "리밸런싱 시작" 을 누르면 이 목록이 그대로 할 일이 된다.
 */
function TradeRows({
  tasks,
  colorMap,
}: {
  tasks: RebalancingTask[];
  colorMap: Map<string, string>;
}) {
  if (tasks.length === 0) return null;
  return (
    <List>
      {tasks.map((task) => (
        <ListItem
          key={task.id}
          prefix={
            <span
              className="size-[10px] block rounded-full"
              style={{
                backgroundColor:
                  colorMap.get(stockPriceKey(task.market, task.ticker)) ?? OTHER_HOLDING_COLOR,
              }}
            />
          }
          title={task.name || task.ticker || "(미선택)"}
          detail={
            task.quantity !== null && (
              <span className="tabular-nums">약 {formatWithCommas(task.quantity)}주</span>
            )
          }
          suffix={
            <div className="flex flex-col items-end gap-x1">
              {/* 진행 중 화면과 같은 표기·모양 */}
              <Badge tone={task.action === "매수" ? "positive" : "critical"} variant="outline">
                {task.action} 권장
              </Badge>
              <span className="t3-medium tabular-nums">{formatWithCommas(task.amount)}원</span>
            </div>
          }
        />
      ))}
    </List>
  );
}
