"use client";

import { useMemo, useState } from "react";
import { IconChevronDownSmallLine } from "@karrotmarket/react-monochrome-icon";
import { Icon } from "@seed-design/react";
import { InvestmentStackedAreaChart } from "@web/app/(app)/assets/investments/_components/investment-stacked-area-chart";
import { TabToolbar } from "@web/components/mobile/detail-layout";
import { profitToneClass } from "@web/components/mobile/profit-tone";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import type { InvestmentItem } from "@web/features/investments/types/types";
import { aggregateHoldings } from "@web/features/investments/utils/aggregate-holdings";
import { sortByHoldingsOption } from "@web/features/investments/utils/sort-holdings";
import { useStockPrices } from "@web/features/investments/utils/use-stock-prices";
import { ActionButton } from "@web/seed-design/ui/action-button";
import { List, ListItem } from "@web/seed-design/ui/list";
import { prepareMonthlyInvestmentSummary } from "@web/utils/monthly-summary-utils";
import { formatReturnRate, numberToKorean } from "@web/utils/number-format";
import { formatProfitKorean } from "@web/utils/profit-color";
import {
  HOLDINGS_SORT_OPTIONS,
  sortOptionLabel,
  SortSheet,
} from "../investments/_components/investment-sheets";

/** 홈 "투자 추이" 탭: 계좌별 누적 평가금액 차트. */
export function InvestmentTrend({ investments }: { investments: InvestmentItem[] }) {
  return (
    <section className="px-x4 py-x4">
      <InvestmentStackedAreaChart investments={investments} />
    </section>
  );
}

/** 홈 "월별 내역" 탭: 월말 평가금액·수익 (최신순). */
export function MonthlySummaryList({ investments }: { investments: InvestmentItem[] }) {
  const monthly = useMemo(
    () =>
      [...prepareMonthlyInvestmentSummary(investments)].sort((a, b) =>
        b.yearMonth.localeCompare(a.yearMonth)
      ),
    [investments]
  );

  if (monthly.length === 0) {
    return (
      <p className="t4-regular text-fg-neutral-subtle px-x4 py-x6 text-center">기록이 없습니다.</p>
    );
  }

  return (
    <List>
      {monthly.map((row) => (
        <ListItem
          key={row.yearMonth}
          title={row.displayMonth}
          detail={`원금 ${numberToKorean(row.initialInvestment) || "0원"}`}
          suffix={
            <div className="text-right">
              <p className="t4-medium tabular-nums">{numberToKorean(row.currentValue) || "0원"}</p>
              <p className={`t2-regular tabular-nums ${profitToneClass(row.profit)}`}>
                {formatProfitKorean(row.profit)} ({formatReturnRate(row.returnRate)})
              </p>
            </div>
          }
        />
      ))}
    </List>
  );
}

/**
 * 홈 "종목" 탭: 모든 계좌의 보유 종목을 종목별로 합친 수량·주당 가격·평가금액.
 * 정렬은 계좌 상세의 보유 종목과 같은 설정(`holdingsSortOption`)을 쓴다.
 */
export function HoldingsSummaryList({ investments }: { investments: InvestmentItem[] }) {
  const holdings = useMemo(() => investments.flatMap((inv) => inv.holdings ?? []), [investments]);
  const { prices, isLoading } = useStockPrices(holdings);
  const sortOption = useInvestmentStore((s) => s.holdingsSortOption);
  const setSortOption = useInvestmentStore((s) => s.setHoldingsSortOption);
  const [sortOpen, setSortOpen] = useState(false);
  const rows = useMemo(
    () => sortByHoldingsOption(aggregateHoldings(investments, prices), sortOption, (row) => row),
    [investments, prices, sortOption]
  );

  if (rows.length === 0) {
    return (
      <p className="t4-regular text-fg-neutral-subtle px-x4 py-x6 text-center">
        보유 종목이 없습니다.
      </p>
    );
  }

  return (
    <>
      <TabToolbar meta={`${rows.length}종목`}>
        {rows.length > 1 && (
          <ActionButton
            variant="ghost"
            size="small"
            bleedX="asPadding"
            onClick={() => setSortOpen(true)}
          >
            {sortOptionLabel(HOLDINGS_SORT_OPTIONS, sortOption)}
            <Icon svg={<IconChevronDownSmallLine />} />
          </ActionButton>
        )}
      </TabToolbar>
      <List>
        {rows.map((row) => {
          const priceText =
            row.price !== null
              ? `주당 ${row.price.toLocaleString()}원`
              : isLoading
                ? "..."
                : "시세 없음";
          return (
            <ListItem
              key={row.key}
              title={row.name}
              detail={
                <span className="tabular-nums">
                  {row.quantity.toLocaleString()}주 · {priceText}
                </span>
              }
              suffix={
                <span className="t4-bold tabular-nums">
                  {row.value !== null ? numberToKorean(row.value) || "0원" : "-"}
                </span>
              }
            />
          );
        })}
      </List>
      <SortSheet
        open={sortOpen}
        onOpenChange={setSortOpen}
        title="보유 종목 정렬"
        options={HOLDINGS_SORT_OPTIONS}
        value={sortOption}
        onChange={setSortOption}
      />
    </>
  );
}
