"use client";

import { useMemo, useState } from "react";
import {
  IconChevronDownSmallLine,
  IconChevronRightLine,
} from "@karrotmarket/react-monochrome-icon";
import { Divider, Icon } from "@seed-design/react";
import { useFlow } from "@stackflow/react";
import {
  sortOptionLabel,
  SortSheet,
  type SortOptionList,
} from "@web/app/m/assets/investments/_components/investment-sheets";
import type { InvestmentItem } from "@web/features/investments/types/types";
import type { StockPricePoint } from "@web/features/investments/utils/use-stock-prices";
import type { PortfolioItem } from "@web/features/portfolio/types/types";
import { isDriftBreached } from "@web/features/portfolio/utils/compute-drift-alert";
import { formatDriftPercent } from "@web/features/portfolio/utils/drift-percent";
import type { LinkedPortfolioStatus } from "@web/features/portfolio/utils/linked-portfolio-status";
import { portfolioStockRows } from "@web/features/portfolio/utils/portfolio-stock-rows";
import {
  DEFAULT_PORTFOLIO_STOCK_SORT_OPTION,
  sortPortfolioStockRows,
  stockRowDrift,
  type PortfolioStockSortOption,
} from "@web/features/portfolio/utils/sort-portfolio-stock-rows";
import { cn } from "@web/lib/utils";
import { ActionButton } from "@web/seed-design/ui/action-button";
import { Badge } from "@web/seed-design/ui/badge";
import { numberToKorean } from "@web/utils/number-format";

const STOCK_SORT_OPTIONS: SortOptionList<PortfolioStockSortOption> = [
  { value: "driftDesc", label: "이격 큰 순" },
  { value: "evalDesc", label: "평가액 높은 순" },
  { value: "evalAsc", label: "평가액 낮은 순" },
  { value: "nameAsc", label: "이름 오름차순" },
  { value: "nameDesc", label: "이름 내림차순" },
];

/**
 * 포트폴리오 상세 "현황" 탭: 연결 계좌별 리밸런싱 필요 여부와, 연결 계좌 전체의 종목별
 * 실제 비중·목표·이격률. 종목별 비중은 연결 계좌의 주식 평가금액 합 기준이라 계좌 하나의
 * 이격(예수금 포함)과는 다를 수 있다.
 */
export function PortfolioOverviewTab({
  portfolio,
  linkedAccounts,
  prices,
  accountStatuses,
}: {
  portfolio: PortfolioItem;
  linkedAccounts: InvestmentItem[];
  prices: Map<string, StockPricePoint>;
  accountStatuses: Map<string, LinkedPortfolioStatus | null>;
}) {
  const { push } = useFlow();
  const [sortOption, setSortOption] = useState<PortfolioStockSortOption>(
    DEFAULT_PORTFOLIO_STOCK_SORT_OPTION
  );
  const [sortOpen, setSortOpen] = useState(false);
  const stockRows = useMemo(
    () =>
      sortPortfolioStockRows(
        portfolioStockRows(portfolio.allocations, linkedAccounts, prices),
        sortOption,
        portfolio.driftMode
      ),
    [portfolio.allocations, portfolio.driftMode, linkedAccounts, prices, sortOption]
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
      {linkedAccounts.map((inv, index) => (
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
              <p className="t3-regular text-fg-neutral-subtle tabular-nums">
                {inv.accountType} · {numberToKorean(inv.currentValue) || "0원"}
              </p>
            </div>
            <RebalancingBadge status={accountStatuses.get(inv.id) ?? null} />
            <Icon svg={<IconChevronRightLine />} size="x4" color="fg.neutralSubtle" />
          </button>
        </div>
      ))}

      <Divider className="mt-x2" />

      <div className="flex items-center justify-between px-x4 pt-x5 pb-x1">
        <h2 className="t5-bold">종목별</h2>
        {stockRows.length > 1 && (
          <ActionButton
            variant="ghost"
            size="small"
            bleedX="asPadding"
            onClick={() => setSortOpen(true)}
          >
            {sortOptionLabel(STOCK_SORT_OPTIONS, sortOption)}
            <Icon svg={<IconChevronDownSmallLine />} />
          </ActionButton>
        )}
      </div>
      {stockRows.length === 0 ? (
        <p className="t4-regular text-fg-neutral-subtle px-x4 py-x4">보유한 종목이 없어요.</p>
      ) : (
        stockRows.map((row, index) => {
          const drift = stockRowDrift(row, portfolio.driftMode);
          const breached = isDriftBreached(
            { targetPercent: row.targetPercent ?? 0, actualPercent: row.percent },
            portfolio
          );
          return (
            <div key={row.key}>
              {index > 0 && <Divider inset />}
              <div className="flex items-center gap-x3 px-x4 py-x3">
                <div className="min-w-0 flex-1">
                  <p className="t5-medium truncate">{row.name || row.ticker}</p>
                  <p className="t3-regular text-fg-neutral-subtle tabular-nums">
                    실제 {row.percent.toFixed(1)}% ·{" "}
                    {row.targetPercent === null ? "목표 없음" : `목표 ${row.targetPercent}%`} · 이격{" "}
                    <span className={cn(breached && "t3-bold text-fg-warning")}>
                      {formatDriftPercent(drift)}
                    </span>
                  </p>
                </div>
                <p className="t5-bold shrink-0 tabular-nums">
                  {numberToKorean(row.value) || "0원"}
                </p>
              </div>
            </div>
          );
        })
      )}

      <SortSheet
        open={sortOpen}
        onOpenChange={setSortOpen}
        title="종목 정렬"
        options={STOCK_SORT_OPTIONS}
        value={sortOption}
        onChange={setSortOption}
      />
    </div>
  );
}

/** 계좌의 리밸런싱 필요 여부. 판정은 계좌 단위 (보유 + 예수금, 목표 비중 대비). */
function RebalancingBadge({ status }: { status: LinkedPortfolioStatus | null }) {
  if (status?.state === "needs-rebalancing") {
    return (
      <Badge tone="warning" variant="solid" className="shrink-0">
        리밸런싱 필요
      </Badge>
    );
  }
  if (status?.state === "ok") {
    return (
      <Badge tone="positive" variant="weak" className="shrink-0">
        정상
      </Badge>
    );
  }
  return (
    <Badge tone="neutral" variant="weak" className="shrink-0">
      판단 불가
    </Badge>
  );
}
