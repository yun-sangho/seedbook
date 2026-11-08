"use client";

import { Fragment, useCallback, useMemo, useState, type CSSProperties } from "react";
import { IconChevronDownSmallLine, IconPlusLine } from "@karrotmarket/react-monochrome-icon";
import { Icon } from "@seed-design/react";
import { useFlow } from "@stackflow/react";
import { usePopThenRemove } from "@web/app/m/_stack/use-pop-then-remove";
import { ConfirmDialog } from "@web/components/mobile/confirm-dialog";
import {
  AddButton,
  EditHint,
  EmptyLine,
  InlineAmount,
  TabToolbar,
} from "@web/components/mobile/detail-layout";
import { HeaderAction } from "@web/components/mobile/header-action";
import { LinkedPortfolioChip } from "@web/components/mobile/linked-portfolio-chip";
import { profitToneClass } from "@web/components/mobile/profit-tone";
import {
  DEFAULT_CASH_LABEL,
  useInvestmentStore,
} from "@web/features/investments/stores/investment-store";
import type { Stock } from "@web/features/investments/types/stock";
import type { InvestmentItem } from "@web/features/investments/types/types";
import { useAccountValuation } from "@web/features/investments/utils/use-account-valuation";
import { stockPriceKey } from "@web/features/investments/utils/use-stock-prices";
import { useLinkedPortfolioStatus } from "@web/features/portfolio/utils/use-linked-portfolio-status";
import { ActionButton } from "@web/seed-design/ui/action-button";
import {
  ChipTabsContent,
  ChipTabsList,
  ChipTabsRoot,
  ChipTabsTrigger,
} from "@web/seed-design/ui/chip-tabs";
import { List, ListButtonItem, ListDivider } from "@web/seed-design/ui/list";
import { ResultSection } from "@web/seed-design/ui/result-section";
import {
  calculateReturnRate,
  formatReturnRate,
  numberToKorean,
  parseNumericString,
} from "@web/utils/number-format";
import { formatProfitKorean } from "@web/utils/profit-color";
import {
  AddHistorySheet,
  AddHoldingFlow,
  HOLDINGS_SORT_OPTIONS,
  sortOptionLabel,
  SortSheet,
} from "../../_components/investment-sheets";
import { AccountSettingsSheet, EditAmountSheet, EditHoldingSheet } from "./account-edit-sheets";

type Editing =
  | { kind: "initial" }
  | { kind: "deposit" }
  | { kind: "settings" }
  | { kind: "holding"; id: string }
  | { kind: "add-holding" }
  | { kind: "add-history" }
  | { kind: "holdings-sort" }
  | { kind: "delete-record"; date: string };

type Tab = "holdings" | "records";

const RECORDS_PREVIEW = 10;

// 보유 종목 행: 위아래 16px, 구분선은 좌우 16px 들여서 (SEED 기본 12px / 전체 폭보다 여유 있게).
const HOLDING_ROW_STYLE: CSSProperties = {
  paddingTop: "var(--seed-dimension-x4)",
  paddingBottom: "var(--seed-dimension-x4)",
};
const HOLDING_DIVIDER_STYLE: CSSProperties = {
  marginLeft: "var(--seed-dimension-x4)",
  marginRight: "var(--seed-dimension-x4)",
};

/** 모바일 계좌 상세 (`/assets/investments/[id]`). */
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
  const holdingsSortOption = useInvestmentStore((s) => s.holdingsSortOption);
  const setHoldingsSortOption = useInvestmentStore((s) => s.setHoldingsSortOption);

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
    referenceDate,
    validHoldingCount,
    stocksTotal,
    cashTotal,
    totalValue,
    markHistoryDirty,
  } = useAccountValuation(item, {
    readOnly: false,
    onSyncCurrentValue: syncCurrentValue,
  });

  // 모바일은 예수금을 하나로 다룬다: 첫 현금 항목(기본 예수금)을 고친다. PC 에서 만든
  // 추가 현금 항목이 있으면 합계에는 포함하되 여기서는 건드리지 않는다.
  const [deposit, ...otherCash] = cashItems;
  const otherCashTotal = cashTotal - (deposit?.amount ?? 0);

  // 데스크탑 카드와 같이 현재 시세 기반 합계를 보여준다. 보유/현금이 없으면 저장값.
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

  const saveDeposit = (draft: string) => {
    if (deposit) {
      updateCashItem(item.id, deposit.id, "amount", draft);
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
      {/* 평가금액 → 수익 → 투자원금·예수금 순서. */}
      <div>
        <section className="px-x4 pt-x4 pb-x3">
          <p className="t9-bold tabular-nums">{numberToKorean(displayValue) || "0원"}</p>
          <p className={`t4-medium mt-x1 tabular-nums ${profitToneClass(profit)}`}>
            {formatProfitKorean(profit)} ({formatReturnRate(returnRate)})
          </p>
          {/* 투자원금·예수금은 수익 아래 테두리 박스 안에 한 줄씩. 각 줄 오른쪽 [수정] 버튼으로 편집한다. */}
          <div className="border-stroke-neutral-muted rounded-r3 mt-x3 border-2 flex flex-col gap-y-x3 px-x4 py-x3">
            <InlineAmount
              label="투자원금"
              value={numberToKorean(item.initialInvestment) || "입력"}
              onEdit={() => setEditing({ kind: "initial" })}
            />
            <InlineAmount
              label={DEFAULT_CASH_LABEL}
              value={numberToKorean(deposit?.amount ?? 0) || "0원"}
              onEdit={() => setEditing({ kind: "deposit" })}
            />
          </div>
          {otherCash.length > 0 && (
            <p className="t2-regular text-fg-neutral-subtle mt-[2px]">
              PC에서 추가한 현금 {numberToKorean(otherCashTotal) || "0원"} 별도
            </p>
          )}
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
                pricesLoading
                  ? "시세 불러오는 중"
                  : referenceDate
                    ? `${referenceDate.slice(5).replace("-", ".")} 기준`
                    : null,
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

      <>
        <EditAmountSheet
          key={`initial-${editing?.kind === "initial"}`}
          {...sheetProps(editing?.kind === "initial")}
          title="투자원금"
          value={item.initialInvestment}
          onSave={(value) => updateInvestment(item.id, "initialInvestment", value)}
        />
        <EditAmountSheet
          key={`deposit-${editing?.kind === "deposit"}`}
          {...sheetProps(editing?.kind === "deposit")}
          title={DEFAULT_CASH_LABEL}
          value={deposit?.amount ?? 0}
          onSave={saveDeposit}
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
      </>
    </div>
  );
}
