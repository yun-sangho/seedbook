"use client";

import { IconChevronRightLine } from "@karrotmarket/react-monochrome-icon";
import { Icon } from "@seed-design/react";
import { useFlow } from "@stackflow/react";
import { LinkedPortfolioChip } from "@web/components/mobile/linked-portfolio-chip";
import { profitToneClass } from "@web/components/mobile/profit-tone";
import type { InvestmentItem } from "@web/features/investments/types/types";
import type { LinkedPortfolioStatus } from "@web/features/portfolio/utils/linked-portfolio-status";
import { calculateReturnRate, formatReturnRate, numberToKorean } from "@web/utils/number-format";
import { formatProfitKorean } from "@web/utils/profit-color";

interface AccountSummaryCardProps {
  item: InvestmentItem;
  /** 이 계좌가 연결된 포트폴리오 (없으면 null). */
  linkedPortfolio: LinkedPortfolioStatus | null;
}

/**
 * 투자 홈의 계좌 행. 탭하면 계좌 상세로 이동하고, 연결된 포트폴리오를 칩으로
 * 보여준다. 연결된 포트폴리오가 리밸런싱이 필요하면 왼쪽에 빨간 막대로 강조한다.
 */
export function AccountSummaryCard({ item, linkedPortfolio }: AccountSummaryCardProps) {
  const needsRebalancing = linkedPortfolio?.state === "needs-rebalancing";
  const profit = item.currentValue - item.initialInvestment;
  const returnRate = calculateReturnRate(item.currentValue, item.initialInvestment);
  const { push } = useFlow();

  return (
    <section className="relative">
      {needsRebalancing && (
        <span
          className="bg-bg-critical-solid absolute inset-y-x3 left-0 w-x1 rounded-r-full"
          aria-hidden
        />
      )}
      <button
        type="button"
        onClick={() => push("AccountDetail", { id: item.id })}
        className="active:bg-bg-layer-default-pressed flex w-full items-center gap-x3 px-x4 py-x4 text-left"
      >
        <span
          className="size-x3 shrink-0 rounded-full"
          style={{ backgroundColor: item.color }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="t5-bold truncate">{item.accountName || "이름 없는 계좌"}</p>
          <p className="t3-regular text-fg-neutral-subtle">{item.accountType}</p>
        </div>
        <div className="text-right">
          <p className="t5-bold tabular-nums">{numberToKorean(item.currentValue) || "0원"}</p>
          <p className={`t3-medium tabular-nums ${profitToneClass(profit)}`}>
            {formatProfitKorean(profit)} ({formatReturnRate(returnRate)})
          </p>
        </div>
        <Icon svg={<IconChevronRightLine />} size="x4" color="fg.neutralSubtle" />
      </button>
      <LinkedPortfolioChip accountId={item.id} status={linkedPortfolio} showEmpty />
    </section>
  );
}
