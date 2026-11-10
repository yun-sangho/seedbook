"use client";

import { useEffect, useMemo, useState } from "react";
import { IconChevronDownSmallLine, IconPlusLine } from "@karrotmarket/react-monochrome-icon";
import { Divider, Icon } from "@seed-design/react";
import { HoldingsPriceAsOfBanner } from "@web/components/mobile/price-as-of-banner";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import {
  DEFAULT_ACCOUNT_SORT_OPTION,
  normalizeAccountSortOption,
  sortAccounts,
  type AccountSortOption,
} from "@web/features/investments/utils/sort-accounts";
import { useLiveAccounts } from "@web/features/investments/utils/use-live-accounts";
import { useLinkedPortfolioStatus } from "@web/features/portfolio/utils/use-linked-portfolio-status";
import { ActionButton } from "@web/seed-design/ui/action-button";
import { ResultSection } from "@web/seed-design/ui/result-section";
import { AccountSummaryCard } from "./account-summary-card";
import { AddAccountSheet } from "./add-account-sheet";
import { ACCOUNT_SORT_OPTIONS, sortOptionLabel, SortSheet } from "./investment-sheets";

const ACCOUNT_SORT_KEY = "seedbook.mobile.accountSort";

/** 계좌 정렬 선택은 기기별 편의 설정이라 localStorage 에만 둔다. */
function useAccountSort(): [AccountSortOption, (value: AccountSortOption) => void] {
  const [value, setValue] = useState<AccountSortOption>(DEFAULT_ACCOUNT_SORT_OPTION);
  useEffect(() => {
    try {
      // 없앤 "기본 순서"(default) 가 저장돼 있으면 기본값(평가액 높은 순)으로 읽는다.
      setValue(normalizeAccountSortOption(window.localStorage.getItem(ACCOUNT_SORT_KEY)));
    } catch {
      // 스토리지 접근 불가 — 기본값 유지
    }
  }, []);
  const update = (next: AccountSortOption) => {
    setValue(next);
    try {
      window.localStorage.setItem(ACCOUNT_SORT_KEY, next);
    } catch {
      // noop
    }
  };
  return [value, update];
}

/**
 * 모바일 "계좌" 탭: 계좌 목록. 계좌를 탭하면 계좌 상세(`/assets/investments/[id]`)로 이동한다.
 * 총 평가금액·통계는 홈(`/assets`)에 있다.
 * 계좌 순서 변경(drag)과 여러 사용자 합산(aggregate) 보기는 데스크탑에서만 지원한다.
 */
export function InvestmentMobile() {
  const storedInvestments = useInvestmentStore((s) => s.investments);
  // 저장된 평가금액이 아니라 지금 시세로 다시 계산한 금액을 보여준다 (계좌 상세와 같은 값).
  const investments = useLiveAccounts(storedInvestments);
  const statusFor = useLinkedPortfolioStatus();

  const [addOpen, setAddOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [accountSort, setAccountSort] = useAccountSort();

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
          <AccountSummaryCard item={item} linkedPortfolio={statusByAccount.get(item.id) ?? null} />
        </div>
      ))}
      <>
        <Divider />
        <div className="flex justify-center pt-x4">
          <ActionButton variant="ghost" size="medium" onClick={() => setAddOpen(true)}>
            <Icon svg={<IconPlusLine />} />
            투자 계좌 추가
          </ActionButton>
        </div>
      </>

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
