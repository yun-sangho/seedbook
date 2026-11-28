"use client";

import { useMemo, useState } from "react";
import { IconChevronDownSmallLine, IconPlusLine } from "@karrotmarket/react-monochrome-icon";
import { Divider, Icon } from "@seed-design/react";
import { HoldingsPriceAsOfBanner } from "@web/components/mobile/price-as-of-banner";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import {
  type AccountSortOption,
  sortAccounts,
} from "@web/features/investments/utils/sort-accounts";
import { useLiveAccounts } from "@web/features/investments/utils/use-live-accounts";
import { useLinkedPortfolioStatus } from "@web/features/portfolio/utils/use-linked-portfolio-status";
import { savePreferences } from "@web/lib/preferences";
import { usePreferencesStore } from "@web/lib/preferences-store";
import { ActionButton } from "@web/seed-design/ui/action-button";
import {
  ChipTabsContent,
  ChipTabsList,
  ChipTabsRoot,
  ChipTabsTrigger,
} from "@web/seed-design/ui/chip-tabs";
import { ResultSection } from "@web/seed-design/ui/result-section";
import { AccountSummaryCard } from "./account-summary-card";
import { AddAccountSheet } from "./add-account-sheet";
import { ACCOUNT_SORT_OPTIONS, SortSheet, sortOptionLabel } from "./investment-sheets";
import { HoldingsSummaryList, InvestmentTrend, MonthlySummaryList } from "./investment-stats";

type Tab = "accounts" | "holdings" | "monthly" | "trend";

/**
 * 모바일 "계좌" 탭: 계좌 목록과 통계(종목 / 월별 내역 / 투자 추이)를 칩 탭으로 나눠 보여준다 (기본은
 * 계좌). 계좌를 탭하면 계좌 상세(`/assets/investments/[id]`)로 이동한다. 총 평가금액은 홈(정원)에 있다.
 * 계좌 순서 변경(drag)과 여러 사용자 합산(aggregate) 보기는 데스크탑에서만 지원한다.
 */
export function InvestmentMobile() {
  const storedInvestments = useInvestmentStore((s) => s.investments);
  // 저장된 평가금액이 아니라 지금 시세로 다시 계산한 금액을 보여준다 (계좌 상세와 같은 값).
  const investments = useLiveAccounts(storedInvestments);
  const statusFor = useLinkedPortfolioStatus();

  const [tab, setTab] = useState<Tab>("accounts");
  const [addOpen, setAddOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  // 정렬은 계정 설정 — 새로고침·다른 기기에서도 이어진다.
  const accountSort = usePreferencesStore((s) => s.accountSortOption);
  const setAccountSort = (option: AccountSortOption) =>
    void savePreferences({ accountSortOption: option });

  const sortedAccounts = useMemo(
    () => sortAccounts(investments, accountSort),
    [investments, accountSort]
  );

  const statusByAccount = useMemo(
    () => new Map(investments.map((inv) => [inv.id, statusFor(inv.id)])),
    [investments, statusFor]
  );

  const addSheet = <AddAccountSheet open={addOpen} onOpenChange={setAddOpen} />;

  if (investments.length === 0) {
    return (
      <div className="flex min-h-[60dvh] flex-col">
        <ResultSection
          title="투자 계좌가 없어요"
          description="첫 투자 계좌를 추가하고 자산의 성장을 추적해보세요."
          primaryActionProps={{ children: "투자 계좌 추가", onClick: () => setAddOpen(true) }}
        />
        {addSheet}
      </div>
    );
  }

  return (
    <div className="pb-x4">
      <HoldingsPriceAsOfBanner investments={investments} />
      <div className="pt-x3" />
      <ChipTabsRoot
        value={tab}
        onValueChange={(value) => setTab(value as Tab)}
        variant="neutralSolid"
        size="medium"
      >
        <ChipTabsList>
          <ChipTabsTrigger value="accounts">계좌</ChipTabsTrigger>
          <ChipTabsTrigger value="holdings">종목</ChipTabsTrigger>
          <ChipTabsTrigger value="monthly">월별 내역</ChipTabsTrigger>
          <ChipTabsTrigger value="trend">투자 추이</ChipTabsTrigger>
        </ChipTabsList>
        <ChipTabsContent value="trend">
          <InvestmentTrend investments={storedInvestments} />
        </ChipTabsContent>
        <ChipTabsContent value="monthly">
          <div className="pt-x2">
            <MonthlySummaryList investments={storedInvestments} />
          </div>
        </ChipTabsContent>
        <ChipTabsContent value="holdings">
          <HoldingsSummaryList investments={storedInvestments} />
        </ChipTabsContent>
        <ChipTabsContent value="accounts">
          <div className="flex h-x12 items-center px-x4">
            <span className="t3-regular text-fg-neutral-subtle flex-1">
              {investments.length}개 계좌
            </span>
            <ActionButton
              variant="ghost"
              size="small"
              // 버튼 안쪽 여백만큼 바깥으로 밀어 오른쪽 끝을 다른 항목과 맞춘다.
              bleedX="asPadding"
              onClick={() => setSortOpen(true)}
            >
              {sortOptionLabel(ACCOUNT_SORT_OPTIONS, accountSort)}
              <Icon svg={<IconChevronDownSmallLine />} />
            </ActionButton>
          </div>
          {sortedAccounts.map((item) => (
            <div key={item.id}>
              <Divider inset />
              <AccountSummaryCard
                item={item}
                linkedPortfolio={statusByAccount.get(item.id) ?? null}
              />
            </div>
          ))}

          <Divider />
          <div className="flex justify-center pt-x4">
            <ActionButton variant="ghost" size="medium" onClick={() => setAddOpen(true)}>
              <Icon svg={<IconPlusLine />} />
              투자 계좌 추가
            </ActionButton>
          </div>
        </ChipTabsContent>
      </ChipTabsRoot>

      {addSheet}
      <SortSheet
        open={sortOpen}
        onOpenChange={setSortOpen}
        title="계좌 정렬"
        options={ACCOUNT_SORT_OPTIONS}
        value={accountSort}
        onChange={setAccountSort}
      />
    </div>
  );
}
