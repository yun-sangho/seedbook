"use client";

import { useMemo } from "react";
import { Divider } from "@seed-design/react";
import { InvestmentStackedAreaChart } from "@web/app/(app)/assets/investments/_components/investment-stacked-area-chart";
import { profitToneClass } from "@web/components/mobile/profit-tone";
import type { InvestmentItem } from "@web/features/investments/types/types";
import { List, ListItem } from "@web/seed-design/ui/list";
import { prepareMonthlyInvestmentSummary } from "@web/utils/monthly-summary-utils";
import { formatReturnRate, numberToKorean } from "@web/utils/number-format";
import { formatProfitKorean } from "@web/utils/profit-color";

/** 통계 탭: 투자 추이 차트 + 월별 내역 (최신순). */
export function InvestmentStats({ investments }: { investments: InvestmentItem[] }) {
  const monthly = useMemo(
    () =>
      [...prepareMonthlyInvestmentSummary(investments)].sort((a, b) =>
        b.yearMonth.localeCompare(a.yearMonth)
      ),
    [investments]
  );

  return (
    <div>
      <section className="px-x4 py-x4">
        <h2 className="t5-bold mb-x3">투자 추이</h2>
        <InvestmentStackedAreaChart investments={investments} />
      </section>

      <Divider />

      <section className="pb-x2">
        <h2 className="t5-bold px-x4 pt-x4 pb-x1">월별 내역</h2>
        {monthly.length === 0 ? (
          <p className="t3-regular text-fg-neutral-subtle px-x4 py-x2">기록이 없습니다.</p>
        ) : (
          <List>
            {monthly.map((row) => (
              <ListItem
                key={row.yearMonth}
                title={row.displayMonth}
                detail={`원금 ${numberToKorean(row.initialInvestment) || "0원"}`}
                suffix={
                  <div className="text-right">
                    <p className="t4-medium tabular-nums">
                      {numberToKorean(row.currentValue) || "0원"}
                    </p>
                    <p className={`t2-regular tabular-nums ${profitToneClass(row.profit)}`}>
                      {formatProfitKorean(row.profit)} ({formatReturnRate(row.returnRate)})
                    </p>
                  </div>
                }
              />
            ))}
          </List>
        )}
      </section>
    </div>
  );
}
