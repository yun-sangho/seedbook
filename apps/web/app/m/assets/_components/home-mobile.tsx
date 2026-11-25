"use client";

import { useMemo, useState } from "react";
import {
  IconArrowClockwiseCircularFill,
  IconCheckmarkCircleFill,
  IconExclamationmarkCircleFill,
} from "@karrotmarket/react-monochrome-icon";
import { useFlow } from "@stackflow/react";
import { switchTab } from "@web/app/m/_stack/stack-control";
import { AddAccountSheet } from "@web/app/m/assets/investments/_components/add-account-sheet";
import { HoldingsPriceAsOfBanner } from "@web/components/mobile/price-as-of-banner";
import { profitToneClass } from "@web/components/mobile/profit-tone";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { summarizeAccounts } from "@web/features/investments/utils/summarize-accounts";
import { useLiveAccounts } from "@web/features/investments/utils/use-live-accounts";
import { useLinkedPortfolioStatus } from "@web/features/portfolio/utils/use-linked-portfolio-status";
import { useRebalancingHomeTab } from "@web/features/rebalancing/stores/rebalancing-home-tab-store";
import { useRebalancingStore } from "@web/features/rebalancing/stores/rebalancing-store";
import { inProgressBanner } from "@web/features/rebalancing/utils/in-progress-banner";
import { inProgressAccountIds } from "@web/features/rebalancing/utils/rebalancing-session";
import { ActionableCallout } from "@web/seed-design/ui/callout";
import {
  ChipTabsContent,
  ChipTabsList,
  ChipTabsRoot,
  ChipTabsTrigger,
} from "@web/seed-design/ui/chip-tabs";
import { ResultSection } from "@web/seed-design/ui/result-section";
import { formatReturnRate, numberToKorean } from "@web/utils/number-format";
import { formatProfitKorean } from "@web/utils/profit-color";
import { HoldingsSummaryList, InvestmentTrend, MonthlySummaryList } from "./investment-stats";

type Tab = "holdings" | "monthly" | "trend";

/**
 * 모바일 홈 (`/assets`). 위에는 핵심만 (총 평가금액·수익, 리밸런싱 알림), 그 아래 통계는
 * 칩 탭(종목 / 월별 내역 / 투자 추이, 기본은 종목)으로 나눠 한 번에 하나만 보여준다. 계좌 목록은 "계좌" 탭.
 */
export function HomeMobile() {
  const investments = useInvestmentStore((s) => s.investments);
  const statusFor = useLinkedPortfolioStatus();
  const { push } = useFlow();
  const [tab, setTab] = useState<Tab>("holdings");
  const [addOpen, setAddOpen] = useState(false);

  // 저장된 평가금액이 아니라 지금 시세로 다시 계산한 금액을 보여준다 (계좌 상세와 같은 값).
  const liveInvestments = useLiveAccounts(investments);
  const totals = useMemo(() => summarizeAccounts(liveInvestments), [liveInvestments]);

  const sessions = useRebalancingStore((s) => s.sessions);
  const busyAccountIds = useMemo(() => inProgressAccountIds(sessions), [sessions]);
  // 연결된 포트폴리오 기준으로 리밸런싱이 필요한 계좌 (계좌 목록 순서대로).
  const accountsNeedingRebalance = useMemo(
    () =>
      investments.filter(
        (inv) =>
          statusFor(inv.id)?.state === "needs-rebalancing" &&
          // 이미 진행 중인 계좌는 다시 시작하라고 하지 않는다.
          !busyAccountIds.has(inv.id)
      ),
    [investments, statusFor, busyAccountIds]
  );

  const resumeBanner = useMemo(
    () => inProgressBanner(sessions, new Map(investments.map((inv) => [inv.id, inv.accountName]))),
    [sessions, investments]
  );
  const showInProgressList = useRebalancingHomeTab((s) => s.setTab);

  const resume = () => {
    if (resumeBanner?.sessionId) {
      push("RebalancingSession", { id: resumeBanner.sessionId });
      return;
    }
    showInProgressList("in-progress");
    switchTab("rebalancing");
  };

  if (investments.length === 0) {
    return (
      <div className="flex min-h-[60dvh] flex-col">
        <ResultSection
          title="투자 계좌가 없어요"
          description="첫 투자 계좌를 추가하고 자산의 성장을 추적해보세요."
          primaryActionProps={{ children: "투자 계좌 추가", onClick: () => setAddOpen(true) }}
          secondaryActionProps={{
            children: "설정에서 데모 데이터 불러오기",
            onClick: () => push("Settings", {}),
          }}
        />
        <AddAccountSheet open={addOpen} onOpenChange={setAddOpen} />
      </div>
    );
  }

  const [firstNeeding] = accountsNeedingRebalance;
  const needingNames = accountsNeedingRebalance.map((inv) => inv.accountName).join(", ");

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

      {/* 하던 일(이어가기)이 새로 시작할 일보다 먼저다. 같은 계좌가 두 배너에 함께 나오지 않는다. */}
      {(resumeBanner || firstNeeding) && (
        <div className="flex flex-col gap-x2 px-x4 pb-x4">
          {resumeBanner && (
            <ActionableCallout
              tone={resumeBanner.readyToComplete ? "positive" : "informative"}
              prefixIcon={
                resumeBanner.readyToComplete ? (
                  <IconCheckmarkCircleFill />
                ) : (
                  <IconArrowClockwiseCircularFill />
                )
              }
              title={resumeBanner.title}
              description={resumeBanner.description}
              onClick={resume}
            />
          )}
          {firstNeeding && (
            <ActionableCallout
              tone="warning"
              prefixIcon={<IconExclamationmarkCircleFill />}
              title="리밸런싱이 필요해요"
              description={needingNames}
              // 계좌 하나면 바로 그 계좌의 리밸런싱으로, 여러 개면 새 리밸런싱에서 고른다.
              onClick={() =>
                accountsNeedingRebalance.length === 1
                  ? push("RebalancingDetail", { id: firstNeeding.id })
                  : push("RebalancingNew", {})
              }
            />
          )}
        </div>
      )}

      <ChipTabsRoot
        value={tab}
        onValueChange={(value) => setTab(value as Tab)}
        variant="neutralSolid"
        size="medium"
      >
        <ChipTabsList>
          <ChipTabsTrigger value="holdings">종목</ChipTabsTrigger>
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
        <ChipTabsContent value="holdings">
          <HoldingsSummaryList investments={investments} />
        </ChipTabsContent>
      </ChipTabsRoot>
    </div>
  );
}
