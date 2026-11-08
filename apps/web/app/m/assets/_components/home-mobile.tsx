"use client";

import { useMemo, useState } from "react";
import {
  IconChevronRightSmallLine,
  IconExclamationmarkCircleFill,
} from "@karrotmarket/react-monochrome-icon";
import { Icon } from "@seed-design/react";
import { useFlow } from "@stackflow/react";
import { useSwitchTab } from "@web/app/m/_stack/use-switch-tab";
import { HoldingsPriceAsOfBanner } from "@web/components/mobile/price-as-of-banner";
import { profitToneClass } from "@web/components/mobile/profit-tone";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { useLinkedPortfolioStatus } from "@web/features/portfolio/utils/use-linked-portfolio-status";
import {
  ChipTabsContent,
  ChipTabsList,
  ChipTabsRoot,
  ChipTabsTrigger,
} from "@web/seed-design/ui/chip-tabs";
import { ResultSection } from "@web/seed-design/ui/result-section";
import { calculateReturnRate, formatReturnRate, numberToKorean } from "@web/utils/number-format";
import { formatProfitKorean } from "@web/utils/profit-color";
import { InvestmentTrend, MonthlySummaryList } from "./investment-stats";

type Tab = "monthly" | "trend";

/**
 * 모바일 홈 (`/assets`). 위에는 핵심만 (총 평가금액·수익, 리밸런싱 알림), 그 아래 통계는
 * 칩 탭(월별 내역 / 투자 추이, 기본은 월별 내역)으로 나눠 한 번에 하나만 보여준다. 계좌 목록은 "계좌" 탭.
 */
export function HomeMobile() {
  const investments = useInvestmentStore((s) => s.investments);
  const statusFor = useLinkedPortfolioStatus();
  const { push } = useFlow();
  const switchTab = useSwitchTab();
  const [tab, setTab] = useState<Tab>("monthly");

  const totals = useMemo(() => {
    const initial = investments.reduce((sum, inv) => sum + (inv.initialInvestment || 0), 0);
    const current = investments.reduce((sum, inv) => sum + (inv.currentValue || 0), 0);
    return {
      initial,
      current,
      profit: current - initial,
      returnRate: calculateReturnRate(current, initial),
    };
  }, [investments]);

  // 연결된 포트폴리오 기준으로 리밸런싱이 필요한 계좌 (계좌 목록 순서대로).
  const accountsNeedingRebalance = useMemo(
    () => investments.filter((inv) => statusFor(inv.id)?.state === "needs-rebalancing"),
    [investments, statusFor]
  );

  if (investments.length === 0) {
    return (
      <div className="flex min-h-[60dvh] flex-col">
        <ResultSection
          title="투자 계좌가 없어요"
          description="계좌 탭에서 첫 투자 계좌를 추가하고 자산의 성장을 추적해보세요."
          primaryActionProps={{
            children: "계좌 탭으로 이동",
            onClick: () => switchTab("AccountsTab"),
          }}
        />
      </div>
    );
  }

  const [firstNeeding] = accountsNeedingRebalance;
  const bannerText = `${accountsNeedingRebalance.map((inv) => inv.accountName).join(", ")} 리밸런싱이 필요해요`;

  return (
    <div className="pb-x4">
      <HoldingsPriceAsOfBanner investments={investments} />
      <section className="px-x5 pt-x6 pb-x5">
        <p className="t4-medium text-fg-neutral-muted">총 평가금액</p>
        <p className="t10-bold mt-x1 tabular-nums">{numberToKorean(totals.current) || "0원"}</p>
        <p className={`t5-medium mt-x1 tabular-nums ${profitToneClass(totals.profit)}`}>
          {formatProfitKorean(totals.profit)} ({formatReturnRate(totals.returnRate)})
        </p>
        <p className="t3-regular text-fg-neutral-subtle mt-x2">
          투자원금 {numberToKorean(totals.initial) || "0원"} · 계좌 {investments.length}개
        </p>
      </section>

      {firstNeeding && (
        <div className="px-x4 pb-x4">
          <button
            type="button"
            // 계좌 하나면 바로 그 계좌의 리밸런싱으로, 여러 개면 새 리밸런싱에서 고른다.
            onClick={() =>
              accountsNeedingRebalance.length === 1
                ? push("RebalancingDetail", { id: firstNeeding.id })
                : push("RebalancingNew", {})
            }
            className="bg-bg-warning-weak text-fg-warning active:bg-bg-warning-weak-pressed rounded-r3 flex w-full items-center gap-x2 px-x4 py-x3 text-left"
          >
            <Icon svg={<IconExclamationmarkCircleFill />} size="x5" />
            <span className="t4-bold min-w-0 flex-1">{bannerText}</span>
            <Icon svg={<IconChevronRightSmallLine />} size="x4" />
          </button>
        </div>
      )}

      <ChipTabsRoot
        value={tab}
        onValueChange={(value) => setTab(value as Tab)}
        variant="neutralSolid"
        size="medium"
      >
        <ChipTabsList>
          <ChipTabsTrigger value="monthly">월별 내역</ChipTabsTrigger>
          <ChipTabsTrigger value="trend">투자 추이</ChipTabsTrigger>
        </ChipTabsList>
        <ChipTabsContent value="trend">
          <InvestmentTrend investments={investments} />
        </ChipTabsContent>
        <ChipTabsContent value="monthly">
          <div className="pt-x2">
            <MonthlySummaryList investments={investments} />
          </div>
        </ChipTabsContent>
      </ChipTabsRoot>
    </div>
  );
}
