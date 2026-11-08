"use client";

import { useMemo } from "react";
import { IconChevronRightLine } from "@karrotmarket/react-monochrome-icon";
import { Divider, Icon } from "@seed-design/react";
import { useFlow } from "@stackflow/react";
import { profitToneClass } from "@web/components/mobile/profit-tone";
import type { InvestmentItem } from "@web/features/investments/types/types";
import { useStockPrices } from "@web/features/investments/utils/use-stock-prices";
import type { PortfolioItem } from "@web/features/portfolio/types/types";
import { portfolioStockRows } from "@web/features/portfolio/utils/portfolio-stock-rows";
import { calculateReturnRate, formatReturnRate, numberToKorean } from "@web/utils/number-format";
import { formatProfitKorean } from "@web/utils/profit-color";

/**
 * 포트폴리오 상세 "현황" 탭: 연결 계좌별 평가금액·수익률과, 연결 계좌 전체의 종목별
 * 평가금액·실제 비중. 종목별 수익률은 매수 단가를 기록하지 않아 보여줄 수 없다.
 */
export function PortfolioOverviewTab({
  portfolio,
  linkedAccounts,
}: {
  portfolio: PortfolioItem;
  linkedAccounts: InvestmentItem[];
}) {
  const { push } = useFlow();
  const allHoldings = useMemo(
    () => linkedAccounts.flatMap((inv) => inv.holdings ?? []),
    [linkedAccounts]
  );
  const { prices } = useStockPrices(allHoldings);
  const stockRows = useMemo(
    () => portfolioStockRows(portfolio.allocations, linkedAccounts, prices),
    [portfolio.allocations, linkedAccounts, prices]
  );

  if (linkedAccounts.length === 0) {
    return (
      <p className="t4-regular text-fg-neutral-subtle px-x4 py-x6 text-center">
        연결된 계좌가 없어요. 적용 계좌 탭에서 연결하세요.
      </p>
    );
  }

  return (
    <div className="pt-x2">
      <h2 className="t5-bold px-x4 pt-x3 pb-x1">계좌별</h2>
      {linkedAccounts.map((inv, index) => {
        const profit = inv.currentValue - inv.initialInvestment;
        const returnRate = calculateReturnRate(inv.currentValue, inv.initialInvestment);
        return (
          <div key={inv.id}>
            {index > 0 && <Divider inset />}
            <button
              type="button"
              onClick={() => push("AccountDetail", { id: inv.id })}
              className="active:bg-bg-layer-default-pressed flex w-full items-center gap-x3 px-x4 py-x3 text-left"
            >
              <span
                className="size-x3 shrink-0 rounded-full"
                style={{ backgroundColor: inv.color }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="t5-bold truncate">{inv.accountName || "이름 없는 계좌"}</p>
                <p className="t3-regular text-fg-neutral-subtle">{inv.accountType}</p>
              </div>
              <div className="text-right">
                <p className="t5-bold tabular-nums">{numberToKorean(inv.currentValue) || "0원"}</p>
                <p className={`t3-medium tabular-nums ${profitToneClass(profit)}`}>
                  {formatProfitKorean(profit)} ({formatReturnRate(returnRate)})
                </p>
              </div>
              <Icon svg={<IconChevronRightLine />} size="x4" color="fg.neutralSubtle" />
            </button>
          </div>
        );
      })}

      <Divider className="mt-x2" />

      <h2 className="t5-bold px-x4 pt-x5 pb-x1">종목별</h2>
      {stockRows.length === 0 ? (
        <p className="t4-regular text-fg-neutral-subtle px-x4 py-x4">보유한 종목이 없어요.</p>
      ) : (
        stockRows.map((row, index) => (
          <div key={row.key}>
            {index > 0 && <Divider inset />}
            <div className="flex items-center gap-x3 px-x4 py-x3">
              <div className="min-w-0 flex-1">
                <p className="t5-medium truncate">{row.name || row.ticker}</p>
                <p className="t3-regular text-fg-neutral-subtle tabular-nums">
                  실제 {row.percent.toFixed(1)}% ·{" "}
                  {row.targetPercent === null ? "목표 없음" : `목표 ${row.targetPercent}%`}
                </p>
              </div>
              <p className="t5-bold shrink-0 tabular-nums">{numberToKorean(row.value) || "0원"}</p>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
