"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  IconChevronDownSmallLine,
  IconChevronRightSmallLine,
  IconExclamationmarkCircleFill,
  IconPlusLine,
} from "@karrotmarket/react-monochrome-icon";
import { Divider, Icon } from "@seed-design/react";
import { profitToneClass } from "@web/components/mobile/profit-tone";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import {
  sortAccounts,
  type AccountSortOption,
} from "@web/features/investments/utils/sort-accounts";
import { useLinkedPortfolioStatuses } from "@web/features/portfolio/utils/use-linked-portfolio-statuses";
import { useIsReadOnly } from "@web/features/sharing/hooks/use-is-read-only";
import { ActionButton } from "@web/seed-design/ui/action-button";
import { ResultSection } from "@web/seed-design/ui/result-section";
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from "@web/seed-design/ui/tabs";
import { calculateReturnRate, formatReturnRate, numberToKorean } from "@web/utils/number-format";
import { formatProfitKorean } from "@web/utils/profit-color";
import { AccountSummaryCard } from "./account-summary-card";
import { AddAccountSheet } from "./add-account-sheet";
import { ACCOUNT_SORT_OPTIONS, sortOptionLabel, SortSheet } from "./investment-sheets";
import { InvestmentStats } from "./investment-stats";

type Tab = "accounts" | "stats";

const ACCOUNT_SORT_KEY = "seedbook.mobile.accountSort";

/** 계좌 정렬 선택은 기기별 편의 설정이라 localStorage 에만 둔다. */
function useAccountSort(): [AccountSortOption, (value: AccountSortOption) => void] {
  const [value, setValue] = useState<AccountSortOption>("default");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(ACCOUNT_SORT_KEY);
      if (ACCOUNT_SORT_OPTIONS.some((o) => o.value === saved)) {
        setValue(saved as AccountSortOption);
      }
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
 * 모바일 투자 홈. 계좌를 탭하면 계좌 상세(`/assets/investments/[id]`)로 이동한다.
 * 계좌 순서 변경(drag)과 여러 사용자 합산(aggregate) 보기는 데스크탑에서만 지원한다.
 */
export function InvestmentMobile() {
  const investments = useInvestmentStore((s) => s.investments);
  const readOnly = useIsReadOnly();
  const statusesFor = useLinkedPortfolioStatuses();

  const [tab, setTab] = useState<Tab>("accounts");
  const [addOpen, setAddOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [accountSort, setAccountSort] = useAccountSort();

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

  const sortedAccounts = useMemo(
    () => sortAccounts(investments, accountSort),
    [investments, accountSort]
  );

  const statusesByAccount = useMemo(
    () => new Map(investments.map((inv) => [inv.id, statusesFor(inv.id)])),
    [investments, statusesFor]
  );

  // 연결된 포트폴리오 중 하나라도 리밸런싱이 필요한 계좌 (목록 순서대로).
  const accountsNeedingRebalance = useMemo(
    () =>
      sortedAccounts.filter((inv) =>
        (statusesByAccount.get(inv.id) ?? []).some((s) => s.state === "needs-rebalancing")
      ),
    [sortedAccounts, statusesByAccount]
  );

  const addSheet = <AddAccountSheet open={addOpen} onOpenChange={setAddOpen} />;

  if (investments.length === 0) {
    return (
      <div className="flex min-h-[60dvh] flex-col">
        <ResultSection
          title="투자 계좌가 없어요"
          description={
            readOnly
              ? "아직 등록된 투자 계좌가 없습니다."
              : "첫 투자 계좌를 추가하고 자산의 성장을 추적해보세요."
          }
          primaryActionProps={
            readOnly ? undefined : { children: "투자 계좌 추가", onClick: () => setAddOpen(true) }
          }
        />
        {addSheet}
      </div>
    );
  }

  const [firstNeeding] = accountsNeedingRebalance;
  const bannerText =
    accountsNeedingRebalance.length === 1
      ? `${firstNeeding?.accountName} 리밸런싱이 필요해요`
      : `${accountsNeedingRebalance.map((inv) => inv.accountName).join(", ")} 리밸런싱이 필요해요`;

  return (
    // 한 장의 표면 위에 섹션을 이어 붙이고 디바이더로 구분한다 (계좌 상세와 같은 방식).
    <div className="pb-x4">
      <section className="px-x5 pt-x6 pb-x5">
        <p className="t4-medium text-fg-neutral-muted">총 평가금액</p>
        <p className="t10-bold mt-x1 tabular-nums">{numberToKorean(totals.current) || "0원"}</p>
        <p className={`t5-medium mt-x1 tabular-nums ${profitToneClass(totals.profit)}`}>
          {formatProfitKorean(totals.profit)} ({formatReturnRate(totals.returnRate)})
        </p>
        <p className="t3-regular text-fg-neutral-subtle mt-x2">
          투자원금 {numberToKorean(totals.initial) || "0원"}
        </p>
      </section>

      {firstNeeding && (
        <div className="px-x4 pb-x4">
          {accountsNeedingRebalance.length === 1 ? (
            // 계좌 하나면 바로 그 계좌 상세로.
            <Link
              href={`/assets/investments/${firstNeeding.id}`}
              className="bg-bg-critical-weak text-fg-critical active:bg-bg-critical-weak-pressed rounded-r3 flex items-center gap-x2 px-x4 py-x3"
            >
              <Icon svg={<IconExclamationmarkCircleFill />} size="x5" />
              <span className="t4-bold min-w-0 flex-1">{bannerText}</span>
              <Icon svg={<IconChevronRightSmallLine />} size="x4" />
            </Link>
          ) : (
            // 여러 계좌면 아래 강조된 계좌 행에서 각각 들어간다.
            <div className="bg-bg-critical-weak text-fg-critical rounded-r3 flex items-center gap-x2 px-x4 py-x3">
              <Icon svg={<IconExclamationmarkCircleFill />} size="x5" />
              <span className="t4-bold min-w-0 flex-1">{bannerText}</span>
            </div>
          )}
        </div>
      )}

      <Divider />

      <TabsRoot value={tab} onValueChange={(value) => setTab(value as Tab)} triggerLayout="fill">
        <TabsList>
          <TabsTrigger value="accounts">계좌</TabsTrigger>
          <TabsTrigger value="stats">통계</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts">
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
                linkedPortfolios={statusesByAccount.get(item.id) ?? []}
              />
            </div>
          ))}
          {!readOnly && (
            <>
              <Divider />
              <div className="flex justify-center pt-x4">
                <ActionButton variant="ghost" size="medium" onClick={() => setAddOpen(true)}>
                  <Icon svg={<IconPlusLine />} />
                  투자 계좌 추가
                </ActionButton>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="stats">
          <InvestmentStats investments={investments} />
        </TabsContent>
      </TabsRoot>

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
