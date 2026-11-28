"use client";

import { type CSSProperties, Fragment, useCallback, useMemo, useState } from "react";
import { IconChevronDownSmallLine, IconPlusLine } from "@karrotmarket/react-monochrome-icon";
import { usePopThenRemove } from "@mobile/app/_stack/use-pop-then-remove";
import { ConfirmDialog } from "@mobile/components/mobile/confirm-dialog";
import {
  AddButton,
  EditHint,
  EmptyLine,
  InlineAmount,
  TabToolbar,
} from "@mobile/components/mobile/detail-layout";
import { HeaderAction } from "@mobile/components/mobile/header-action";
import { LinkedPortfolioChip } from "@mobile/components/mobile/linked-portfolio-chip";
import { PriceAsOfBanner } from "@mobile/components/mobile/price-as-of-banner";
import { profitToneClass } from "@mobile/components/mobile/profit-tone";
import {
  DEFAULT_CASH_LABEL,
  useInvestmentStore,
} from "@mobile/features/investments/stores/investment-store";
import type { HoldingsSortOption } from "@mobile/features/investments/types/holdings-sort";
import type { Stock } from "@mobile/features/investments/types/stock";
import type { InvestmentItem } from "@mobile/features/investments/types/types";
import { useAccountValuation } from "@mobile/features/investments/utils/use-account-valuation";
import { stockPriceKey } from "@mobile/features/investments/utils/use-stock-prices";
import { useLinkedPortfolioStatus } from "@mobile/features/portfolio/utils/use-linked-portfolio-status";
import { savePreferences } from "@mobile/lib/preferences";
import { usePreferencesStore } from "@mobile/lib/preferences-store";
import { ActionButton } from "@mobile/seed-design/ui/action-button";
import {
  ChipTabsContent,
  ChipTabsList,
  ChipTabsRoot,
  ChipTabsTrigger,
} from "@mobile/seed-design/ui/chip-tabs";
import { List, ListButtonItem, ListDivider } from "@mobile/seed-design/ui/list";
import { ResultSection } from "@mobile/seed-design/ui/result-section";
import {
  calculateReturnRate,
  formatReturnRate,
  formatSignedWon,
  formatWithCommas,
  numberToKorean,
  parseNumericString,
} from "@mobile/utils/number-format";
import { formatProfitWon } from "@mobile/utils/profit-color";
import { Icon } from "@seed-design/react";
import { useFlow } from "@stackflow/react";
import {
  AddHistorySheet,
  AddHoldingFlow,
  HOLDINGS_SORT_OPTIONS,
  SortSheet,
  sortOptionLabel,
} from "../../_components/investment-sheets";
import { AccountSettingsSheet, EditAmountSheet, EditHoldingSheet } from "./account-edit-sheets";

type Editing =
  | { kind: "initial" }
  | { kind: "cash" }
  | { kind: "settings" }
  | { kind: "holding"; id: string }
  | { kind: "add-holding" }
  | { kind: "add-history" }
  | { kind: "holdings-sort" }
  | { kind: "delete-record"; date: string };

type Tab = "holdings" | "records";

const RECORDS_PREVIEW = 10;

/** 계좌의 현금 항목 합계를 부르는 이름. 예수금·주문가능금액·CMA 등을 따로 구분하지 않는다. */
const CASH_LABEL = "현금성 자산";

// 보유 종목 행: 위아래 16px, 구분선은 좌우 16px 들여서 (SEED 기본 12px / 전체 폭보다 여유 있게).
const HOLDING_ROW_STYLE: CSSProperties = {
  paddingTop: "var(--seed-dimension-x4)",
  paddingBottom: "var(--seed-dimension-x4)",
};
const HOLDING_DIVIDER_STYLE: CSSProperties = {
  marginLeft: "var(--seed-dimension-x4)",
  marginRight: "var(--seed-dimension-x4)",
};

/** 모바일 계좌 상세 (`/accounts/[id]`). */
export function AccountDetailMobile({ id }: { id: string }) {
  const item = useInvestmentStore((s) => s.investments.find((inv) => inv.id === id));
  const { pop } = useFlow();

  if (!item) {
    return (
      <div className="flex min-h-[60dvh] flex-col">
        <ResultSection
          title="계좌를 찾을 수 없어요"
          description="삭제되었거나 잘못된 링크일 수 있습니다."
          primaryActionProps={{
            children: "돌아가기",
            onClick: () => pop(),
          }}
        />
      </div>
    );
  }

  return <AccountDetailBody item={item} />;
}

function AccountDetailBody({ item }: { item: InvestmentItem }) {
  const [tab, setTab] = useState<Tab>("holdings");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [showAllRecords, setShowAllRecords] = useState(false);

  const updateInvestment = useInvestmentStore((s) => s.updateInvestment);
  const removeInvestment = useInvestmentStore((s) => s.removeInvestment);
  const deleteAccount = usePopThenRemove(() => removeInvestment(item.id));
  const addHistoryRecord = useInvestmentStore((s) => s.addHistoryRecord);
  const removeInvestmentHistoryRecord = useInvestmentStore((s) => s.removeInvestmentHistoryRecord);
  const addStockHolding = useInvestmentStore((s) => s.addStockHolding);
  const updateStockHolding = useInvestmentStore((s) => s.updateStockHolding);
  const removeStockHolding = useInvestmentStore((s) => s.removeStockHolding);
  const addCashItem = useInvestmentStore((s) => s.addCashItem);
  const updateCashItem = useInvestmentStore((s) => s.updateCashItem);
  const removeCashItem = useInvestmentStore((s) => s.removeCashItem);
  const holdingsSortOption = usePreferencesStore((s) => s.holdingsSortOption);
  const setHoldingsSortOption = (option: HoldingsSortOption) =>
    void savePreferences({ holdingsSortOption: option });

  const linkedPortfolio = useLinkedPortfolioStatus()(item.id);

  const syncCurrentValue = useCallback(
    (value: number) => updateInvestment(item.id, "currentValue", String(value)),
    [item.id, updateInvestment]
  );
  const {
    cashItems,
    sortedHoldings,
    prices,
    pricesLoading,
    validHoldingCount,
    stocksTotal,
    cashTotal,
    totalValue,
    markHistoryDirty,
  } = useAccountValuation(item, { onSyncCurrentValue: syncCurrentValue });

  // 모바일은 현금 항목을 나누지 않고 "현금성 자산" 합계 하나로 다룬다 — 증권사 앱의 예수금과
  // 주문가능금액이 서로 다를 수 있어 둘 중 하나로 부르지 않는다. PC 에서 항목을 여러 개 만들었으면
  // 합계를 고칠 때 첫 항목 하나로 합친다.
  const [firstCash, ...otherCash] = cashItems;

  // 데스크탑 카드와 같이 현재 시세 기반 합계를 보여준다. 보유/현금이 없으면 저장값
  // (`liveAccountValue` 와 같은 규칙 — 목록·합계도 이 값을 쓴다).
  const displayValue = totalValue > 0 ? totalValue : item.currentValue;
  const profit = displayValue - item.initialInvestment;
  const returnRate = calculateReturnRate(displayValue, item.initialInvestment);

  const existingHoldingKeys = useMemo(
    () =>
      new Set(
        (item.holdings ?? [])
          .filter((h) => h.market && h.ticker)
          .map((h) => stockPriceKey(h.market, h.ticker))
      ),
    [item.holdings]
  );

  const sortedRecords = useMemo(
    () => [...item.records].sort((a, b) => b.date.localeCompare(a.date)),
    [item.records]
  );
  const visibleRecords = showAllRecords ? sortedRecords : sortedRecords.slice(0, RECORDS_PREVIEW);

  const close = () => setEditing(null);
  const sheetProps = (open: boolean) => ({
    open,
    onOpenChange: (next: boolean) => !next && close(),
  });

  const editingHolding =
    editing?.kind === "holding" ? sortedHoldings.find((h) => h.id === editing.id) : undefined;

  const holdingPrice = (market: string, ticker: string) =>
    market && ticker ? (prices.get(stockPriceKey(market, ticker))?.close ?? null) : null;

  const saveCashTotal = (draft: string) => {
    if (firstCash) {
      updateCashItem(item.id, firstCash.id, "amount", draft);
      for (const cash of otherCash) removeCashItem(item.id, cash.id);
    } else {
      const amount = parseNumericString(draft);
      addCashItem(item.id, {
        label: DEFAULT_CASH_LABEL,
        amount: Number.isFinite(amount) ? amount : 0,
      });
    }
    markHistoryDirty();
  };

  return (
    <div className="pb-x4">
      <PriceAsOfBanner prices={prices} />
      {/* 평가금액 → 수익 → 투자원금·현금성 자산 순서. 상세라서 만원 단위로 줄이지 않고 1원까지 보여준다. */}
      <div>
        <section className="px-x4 pt-x4 pb-x3">
          <p className="flex flex-wrap items-baseline gap-x-x2">
            <span className="t9-bold tabular-nums">
              {formatWithCommas(Math.round(displayValue))}원
            </span>
            {/* 큰 금액을 한눈에 읽도록 만원 단위 한글 금액을 작게 덧붙인다. */}
            <span className="t4-regular text-fg-neutral-subtle tabular-nums">
              {numberToKorean(displayValue) || "0원"}
            </span>
          </p>
          <p className={`t4-medium mt-x1 tabular-nums ${profitToneClass(profit)}`}>
            {formatProfitWon(profit)} ({formatReturnRate(returnRate)})
          </p>
          {/* 투자원금·현금성 자산은 수익 아래 테두리 박스 안에 한 줄씩. 각 줄 오른쪽 [수정] 버튼으로 편집한다. */}
          <div className="border-stroke-neutral-muted rounded-r3 mt-x3 border-2 flex flex-col gap-y-x3 px-x4 py-x3">
            <InlineAmount
              label="투자원금"
              value={
                item.initialInvestment ? `${formatWithCommas(item.initialInvestment)}원` : "입력"
              }
              onEdit={() => setEditing({ kind: "initial" })}
            />
            <InlineAmount
              label={CASH_LABEL}
              value={formatSignedWon(cashTotal)}
              onEdit={() => setEditing({ kind: "cash" })}
            />
          </div>
        </section>

        <LinkedPortfolioChip accountId={item.id} status={linkedPortfolio} />
      </div>

      <ChipTabsRoot
        value={tab}
        onValueChange={(value) => setTab(value as Tab)}
        variant="neutralSolid"
        size="medium"
      >
        <div className="pt-x3">
          <ChipTabsList>
            <ChipTabsTrigger value="holdings">보유 종목</ChipTabsTrigger>
            <ChipTabsTrigger value="records">기록</ChipTabsTrigger>
          </ChipTabsList>
        </div>

        <ChipTabsContent value="holdings">
          <TabToolbar
            meta={
              [
                validHoldingCount > 0
                  ? `${validHoldingCount}종목 · ${numberToKorean(stocksTotal)}`
                  : null,
                // 가격 기준 시각은 화면 상단 PriceAsOfBanner 가 보여준다.
                pricesLoading ? "시세 불러오는 중" : null,
              ]
                .filter(Boolean)
                .join(" · ") || undefined
            }
          >
            {sortedHoldings.length > 1 && (
              <ActionButton
                variant="ghost"
                size="small"
                bleedX="asPadding"
                onClick={() => setEditing({ kind: "holdings-sort" })}
              >
                {sortOptionLabel(HOLDINGS_SORT_OPTIONS, holdingsSortOption)}
                <Icon svg={<IconChevronDownSmallLine />} />
              </ActionButton>
            )}
          </TabToolbar>
          {sortedHoldings.length === 0 ? (
            <EmptyLine>보유 종목이 없습니다.</EmptyLine>
          ) : (
            <List>
              {sortedHoldings.map((h, index) => {
                const price = holdingPrice(h.market, h.ticker);
                const detail =
                  !h.market || !h.ticker
                    ? `${h.quantity.toLocaleString()}주 · 종목 미선택`
                    : price === null
                      ? `${h.quantity.toLocaleString()}주 · ${pricesLoading ? "..." : "시세 없음"}`
                      : `${h.quantity.toLocaleString()}주 · 주당 ${price.toLocaleString()}원`;
                return (
                  <Fragment key={h.id}>
                    {/* 종목 사이에만 구분선 (맨 위·맨 아래 제외). */}
                    {index > 0 && <ListDivider style={HOLDING_DIVIDER_STYLE} />}
                    <ListButtonItem
                      // 종목명 16px medium, 평가액 16px bold (행 가운데 정렬).
                      title={<span className="t5-medium">{h.name || h.ticker || "(미지정)"}</span>}
                      detail={
                        // 수량은 이 줄에서 고치므로 "수정" 표시도 수량 옆에 둔다.
                        <span className="t4-regular text-fg-neutral-muted mt-[2px] inline-flex items-center gap-x1">
                          {detail}
                          <EditHint />
                        </span>
                      }
                      suffix={
                        <span className="t5-bold text-fg-neutral tabular-nums">
                          {price !== null ? numberToKorean(price * h.quantity) || "0원" : "-"}
                        </span>
                      }
                      alignItems="center"
                      rootProps={{ style: HOLDING_ROW_STYLE }}
                      aria-label={`${h.name || h.ticker || "종목"} 수량 수정`}
                      onClick={() => setEditing({ kind: "holding", id: h.id })}
                    />
                  </Fragment>
                );
              })}
            </List>
          )}
          {/* 종목 추가는 목록 맨 아래에 둔다 (목록을 다 본 뒤 이어서 추가하는 흐름). */}
          <div className="flex justify-center pt-x2">
            <ActionButton
              variant="ghost"
              size="medium"
              onClick={() => setEditing({ kind: "add-holding" })}
            >
              <Icon svg={<IconPlusLine />} />
              종목 추가
            </ActionButton>
          </div>
        </ChipTabsContent>

        <ChipTabsContent value="records">
          <TabToolbar meta={sortedRecords.length > 0 ? `${sortedRecords.length}건` : undefined}>
            <AddButton onClick={() => setEditing({ kind: "add-history" })}>추가</AddButton>
          </TabToolbar>
          {sortedRecords.length === 0 ? (
            <EmptyLine>기록이 없습니다.</EmptyLine>
          ) : (
            <List>
              {visibleRecords.map((r, index) => {
                // 최신 기록은 현재 값과 연동되므로 삭제를 막는다 (데스크탑과 동일).
                const deletable = index !== 0;
                return (
                  <ListButtonItem
                    key={r.date}
                    title={new Date(r.date).toLocaleDateString("ko-KR")}
                    detail={`원금 ${numberToKorean(r.initialInvestment) || "0원"}`}
                    suffix={
                      <span className="t4-medium tabular-nums">
                        {numberToKorean(r.currentValue) || "0원"}
                      </span>
                    }
                    disabled={!deletable}
                    onClick={() => setEditing({ kind: "delete-record", date: r.date })}
                  />
                );
              })}
            </List>
          )}
          {sortedRecords.length > RECORDS_PREVIEW && (
            <div className="px-x4 pt-x1">
              <ActionButton
                variant="neutralWeak"
                size="small"
                className="w-full"
                onClick={() => setShowAllRecords((v) => !v)}
              >
                {showAllRecords
                  ? "접기"
                  : `기록 ${sortedRecords.length - RECORDS_PREVIEW}건 더 보기`}
              </ActionButton>
            </div>
          )}
        </ChipTabsContent>
      </ChipTabsRoot>

      <HeaderAction>
        <ActionButton
          variant="ghost"
          size="small"
          aria-label="계좌 수정"
          onClick={() => setEditing({ kind: "settings" })}
        >
          수정
        </ActionButton>
      </HeaderAction>

      <SortSheet
        {...sheetProps(editing?.kind === "holdings-sort")}
        title="보유 종목 정렬"
        options={HOLDINGS_SORT_OPTIONS}
        value={holdingsSortOption}
        onChange={setHoldingsSortOption}
      />

      <EditAmountSheet
        key={`initial-${editing?.kind === "initial"}`}
        {...sheetProps(editing?.kind === "initial")}
        title="투자원금"
        value={item.initialInvestment}
        onSave={(value) => updateInvestment(item.id, "initialInvestment", value)}
      />
      <EditAmountSheet
        key={`cash-${editing?.kind === "cash"}`}
        {...sheetProps(editing?.kind === "cash")}
        title={CASH_LABEL}
        description={
          otherCash.length > 0
            ? `PC에서 나눠 둔 현금 항목 ${cashItems.length}개가 하나로 합쳐져요.`
            : "예수금·CMA·MMF 등 바로 쓸 수 있는 현금을 합친 금액이에요."
        }
        value={cashTotal}
        onSave={saveCashTotal}
        allowNegative
      />
      {editingHolding && (
        <EditHoldingSheet
          key={editingHolding.id}
          {...sheetProps(true)}
          holding={editingHolding}
          price={holdingPrice(editingHolding.market, editingHolding.ticker)}
          onSave={(quantity) => {
            updateStockHolding(item.id, editingHolding.id, "quantity", quantity);
            markHistoryDirty();
          }}
          onDelete={() => {
            removeStockHolding(item.id, editingHolding.id);
            markHistoryDirty();
          }}
        />
      )}
      <AccountSettingsSheet
        key={`settings-${editing?.kind === "settings"}`}
        {...sheetProps(editing?.kind === "settings")}
        item={item}
        onRename={(name) => updateInvestment(item.id, "accountName", name)}
        onColorChange={(color) => updateInvestment(item.id, "color", color)}
        onDelete={deleteAccount}
      />
      <AddHoldingFlow
        {...sheetProps(editing?.kind === "add-holding")}
        existingHoldingKeys={existingHoldingKeys}
        onAdd={(stock: Stock, quantity: number) => {
          addStockHolding(item.id, {
            market: stock.market,
            ticker: stock.ticker,
            name: stock.name,
            currency: stock.currency,
            quantity,
          });
          markHistoryDirty();
        }}
      />
      <AddHistorySheet
        {...sheetProps(editing?.kind === "add-history")}
        onAdd={(date, initial, current) => addHistoryRecord(item.id, date, initial, current)}
      />
      <ConfirmDialog
        open={editing?.kind === "delete-record"}
        onOpenChange={(next) => !next && close()}
        title="이 기록을 삭제할까요?"
        description={
          editing?.kind === "delete-record"
            ? new Date(editing.date).toLocaleDateString("ko-KR")
            : undefined
        }
        onConfirm={() => {
          if (editing?.kind === "delete-record") {
            removeInvestmentHistoryRecord(item.id, editing.date);
          }
          close();
        }}
      />
    </div>
  );
}
