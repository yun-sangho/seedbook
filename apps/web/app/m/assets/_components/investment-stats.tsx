"use client";

import { useMemo } from "react";
import { InvestmentStackedAreaChart } from "@web/app/(app)/assets/investments/_components/investment-stacked-area-chart";
import { profitToneClass } from "@web/components/mobile/profit-tone";
import type { InvestmentItem } from "@web/features/investments/types/types";
import { List, ListItem } from "@web/seed-design/ui/list";
import { prepareMonthlyInvestmentSummary } from "@web/utils/monthly-summary-utils";
import { formatReturnRate, numberToKorean } from "@web/utils/number-format";
import { formatProfitKorean } from "@web/utils/profit-color";

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
