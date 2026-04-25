"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AssetNameInput } from "@web/components/ui/asset-name-input";
import { Badge } from "@web/components/ui/badge";
import { Button } from "@web/components/ui/button";
import { Card, CardContent, CardHeader } from "@web/components/ui/card";
import { Input } from "@web/components/ui/input";
import { Label } from "@web/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@web/components/ui/popover";
import { StockCombobox } from "@web/features/investments/components/stock-combobox";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { ACCOUNT_COLORS } from "@web/features/investments/types/constants";
import type { Stock } from "@web/features/investments/types/stock";
import { CashItem, InvestmentItem, StockHolding } from "@web/features/investments/types/types";
import { sortHoldings } from "@web/features/investments/utils/sort-holdings";
import { stockPriceKey, useStockPrices } from "@web/features/investments/utils/use-stock-prices";
import { numberToKorean } from "@web/utils/number-format";
import { AddCashItemModal } from "./add-cash-item-modal";
import { AddHistoryModal } from "./add-history-modal";
import { AddStockHoldingModal } from "./add-stock-holding-modal";

interface InvestmentItemComponentProps {
  item: InvestmentItem;
  onUpdateItem: (id: string, field: keyof InvestmentItem, value: string) => void;
  onRemoveHistoryRecord: (id: string, date: string) => void;
  onAddHistory: (
    itemId: string,
    date: string,
    initialInvestment: number,
    currentValue: number
  ) => void;
  onRemoveInvestment: (id: string) => void;
  onAddStockHolding: (
    investmentId: string,
    initial?: {
      market: string;
      ticker: string;
      name: string;
      currency: string;
      quantity: number;
    }
  ) => void;
  onUpdateStockHolding: (
    investmentId: string,
    holdingId: string,
    field: keyof StockHolding,
    value: string | number
  ) => void;
  onSetStockHoldingFromSearch: (investmentId: string, holdingId: string, stock: Stock) => void;
  onRemoveStockHolding: (investmentId: string, holdingId: string) => void;
  onAddCashItem: (investmentId: string, initial?: { label: string; amount: number }) => void;
  onUpdateCashItem: (
    investmentId: string,
    cashItemId: string,
    field: keyof CashItem,
    value: string | number
  ) => void;
  onRemoveCashItem: (investmentId: string, cashItemId: string) => void;
}

export function InvestmentItemComponent({
  item,
  onUpdateItem,
  onRemoveHistoryRecord,
  onAddHistory,
  onRemoveInvestment,
  onAddStockHolding,
  onUpdateStockHolding,
  onSetStockHoldingFromSearch,
  onRemoveStockHolding,
  onAddCashItem,
  onUpdateCashItem,
  onRemoveCashItem,
}: InvestmentItemComponentProps) {
  const [isRecordsExpanded, setIsRecordsExpanded] = useState(false);
  const [isAddHistoryModalOpen, setIsAddHistoryModalOpen] = useState(false);
  const [isAddHoldingModalOpen, setIsAddHoldingModalOpen] = useState(false);
  const [isAddCashModalOpen, setIsAddCashModalOpen] = useState(false);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [pendingHistorySync, setPendingHistorySync] = useState(false);

  const holdingsSortOption = useInvestmentStore((state) => state.holdingsSortOption);

  const holdingsListRef = useRef<HTMLDivElement>(null);
  const cashListRef = useRef<HTMLDivElement>(null);
  const prevHoldingsCount = useRef(item.holdings?.length ?? 0);
  const prevCashItemsCount = useRef(item.cashItems?.length ?? 0);

  const cashItems = useMemo(() => item.cashItems ?? [], [item.cashItems]);
  const holdings = useMemo(() => item.holdings ?? [], [item.holdings]);

  const { prices, isLoading: pricesLoading } = useStockPrices(holdings);

  const referenceDate = useMemo(() => {
    let latest: string | null = null;
    prices.forEach((p) => {
      if (!latest || p.date > latest) latest = p.date;
    });
    return latest;
  }, [prices]);

  const validHoldings = holdings.filter((h) => h.market && h.ticker);
  const allHoldingsHavePrices =
    validHoldings.length === 0 ||
    validHoldings.every((h) => prices.has(stockPriceKey(h.market, h.ticker)));

  const stocksTotal = useMemo(() => {
    return holdings.reduce((sum, h) => {
      if (!h.market || !h.ticker) return sum;
      const point = prices.get(stockPriceKey(h.market, h.ticker));
      if (!point) return sum;
      return sum + point.close * h.quantity;
    }, 0);
  }, [holdings, prices]);

  // 정렬된 보유 주식 목록. 가격 정보가 없는 종목은 항상 맨 뒤로 밀어 순서가 흔들리는 것을 방지한다.
  const sortedHoldings = useMemo(
    () => sortHoldings(holdings, prices, holdingsSortOption),
    [holdings, prices, holdingsSortOption]
  );

  const cashTotal = useMemo(
    () => cashItems.reduce((sum, c) => sum + (c.amount || 0), 0),
    [cashItems]
  );

  const totalValue = stocksTotal + cashTotal;

  // 보유주식/현금 항목 변경 시 currentValue 에 totalValue 를 반영한다. updateInvestment
  // 내부 로직이 오늘 날짜로 히스토리 레코드를 자동 생성/갱신한다. 가격 로딩이 끝나고
  // 모든 종목의 시세가 준비된 뒤에만 적용해야 잘못된 0 원/이전 시세로 덮어쓰지 않는다.
  useEffect(() => {
    if (!pendingHistorySync) return;
    if (pricesLoading) return;
    if (!allHoldingsHavePrices) return;
    onUpdateItem(item.id, "currentValue", String(totalValue));
    setPendingHistorySync(false);
  }, [pendingHistorySync, pricesLoading, allHoldingsHavePrices, totalValue, item.id, onUpdateItem]);

  const handleColorChange = (color: string) => {
    onUpdateItem(item.id, "color", color);
    setIsColorPickerOpen(false);
  };

  const markHistoryDirty = () => setPendingHistorySync(true);

  const handleUpdateStockHolding = (
    investmentId: string,
    holdingId: string,
    field: keyof StockHolding,
    value: string | number
  ) => {
    onUpdateStockHolding(investmentId, holdingId, field, value);
    markHistoryDirty();
  };

  const handleSetStockHoldingFromSearch = (
    investmentId: string,
    holdingId: string,
    stock: Stock
  ) => {
    onSetStockHoldingFromSearch(investmentId, holdingId, stock);
    markHistoryDirty();
  };

  const handleRemoveStockHolding = (investmentId: string, holdingId: string) => {
    onRemoveStockHolding(investmentId, holdingId);
    markHistoryDirty();
  };

  const handleUpdateCashItem = (
    investmentId: string,
    cashItemId: string,
    field: keyof CashItem,
    value: string | number
  ) => {
    onUpdateCashItem(investmentId, cashItemId, field, value);
    markHistoryDirty();
  };

  const handleRemoveCashItem = (investmentId: string, cashItemId: string) => {
    onRemoveCashItem(investmentId, cashItemId);
    markHistoryDirty();
  };

  const handleAddHoldingFromModal = (stock: Stock, quantity: number) => {
    onAddStockHolding(item.id, {
      market: stock.market,
      ticker: stock.ticker,
      name: stock.name,
      currency: stock.currency,
      quantity,
    });
    markHistoryDirty();
  };

  const handleAddCashFromModal = (label: string, amount: number) => {
    onAddCashItem(item.id, { label, amount });
    markHistoryDirty();
  };

  // 종목/현금 항목 개수가 늘어나면 해당 리스트를 맨 아래로 스크롤해 새 레코드를 확인하기 쉽게 한다.
  useEffect(() => {
    if (holdings.length > prevHoldingsCount.current) {
      holdingsListRef.current?.scrollTo({
        top: holdingsListRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
    prevHoldingsCount.current = holdings.length;
  }, [holdings.length]);

  useEffect(() => {
    if (cashItems.length > prevCashItemsCount.current) {
      cashListRef.current?.scrollTo({
        top: cashListRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
    prevCashItemsCount.current = cashItems.length;
  }, [cashItems.length]);

  const existingHoldingKeys = useMemo(() => {
    return new Set(
      holdings.filter((h) => h.market && h.ticker).map((h) => stockPriceKey(h.market, h.ticker))
    );
  }, [holdings]);

  return (
    <Card key={item.id} className="gap-4">
      <CardHeader>
        <div className="flex gap-2 flex-wrap sm:items-center max-sm:flex-col ">
          <div className="flex items-center gap-2">
            <Popover open={isColorPickerOpen} onOpenChange={setIsColorPickerOpen}>
              <PopoverTrigger asChild>
                <button
                  className="w-6 h-6 rounded"
                  style={{ backgroundColor: item.color }}
                  title="색상 변경"
                />
              </PopoverTrigger>
              <PopoverContent className="w-auto p-3" align="start">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">계좌 색상 선택</p>
                  <div className="grid grid-cols-5 gap-2">
                    {ACCOUNT_COLORS.map((color) => (
                      <button
                        key={color}
                        onClick={() => handleColorChange(color)}
                        className="w-8 h-8 rounded border-2 hover:scale-110 transition-transform"
                        style={{
                          backgroundColor: color,
                          borderColor:
                            color === item.color ? "hsl(var(--foreground))" : "transparent",
                        }}
                        title={color}
                      />
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <Badge variant={"secondary"}>{item.accountType}</Badge>
          </div>
          <div
            className="flex justify-between items-center flex-grow-1 flex-wrap"
            onClick={() => setIsRecordsExpanded(!isRecordsExpanded)}
          >
            <AssetNameInput
              id={item.id}
              value={item.accountName}
              onChange={(value) => onUpdateItem(item.id, "accountName", value)}
            />
            <Button size={"sm"} variant={"ghost"}>
              {isRecordsExpanded ? "접기" : "상세 보기"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="w-full flex gap-4 flex-wrap justify-between">
          <div className="flex items-center gap-2 relative flex-grow-1">
            <Label htmlFor={`initialInvestment-${item.id}`} className="text-sm ">
              투자원금
            </Label>
            <Input
              id={`initialInvestment-${item.id}`}
              type="text"
              value={
                item.initialInvestment && item.initialInvestment > 0
                  ? item.initialInvestment.toLocaleString()
                  : ""
              }
              onChange={(e) => onUpdateItem(item.id, "initialInvestment", e.target.value)}
              placeholder="투자원금 입력"
              className="text-sm flex-1"
            />
            {!!item.initialInvestment && item.initialInvestment > 0 && (
              <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs   px-1 z-10 pointer-events-none">
                {numberToKorean(item.initialInvestment)}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 relative flex-grow-1">
            <Label htmlFor={`currentValue-${item.id}`} className="text-sm ">
              평가금액
            </Label>
            <Input
              id={`currentValue-${item.id}`}
              type="text"
              value={totalValue > 0 ? totalValue.toLocaleString() : ""}
              placeholder={pricesLoading ? "가격 불러오는 중..." : "0"}
              readOnly
              tabIndex={-1}
              className="text-sm flex-1 bg-muted/30 cursor-default"
            />
            {totalValue > 0 && (
              <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs px-1 z-10 pointer-events-none">
                {numberToKorean(totalValue)}
              </div>
            )}
          </div>
        </div>

        {isRecordsExpanded && (
          <div className="w-full space-y-3">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 justify-between items-center">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    보유 주식
                  </span>
                  {validHoldings.length > 0 && (
                    <span className="text-sm text-muted-foreground">
                      {validHoldings.length}종목 · {numberToKorean(stocksTotal)}
                    </span>
                  )}
                  {pricesLoading ? (
                    <Badge variant="secondary" className="text-xs">
                      가격 불러오는 중...
                    </Badge>
                  ) : referenceDate ? (
                    <Badge variant="secondary" className="text-xs">
                      가격 기준일 {new Date(referenceDate).toLocaleDateString("ko-KR")}
                    </Badge>
                  ) : null}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddHoldingModalOpen(true)}
                  className="h-7 text-xs"
                >
                  + 종목 추가
                </Button>
              </div>

              {holdings.length > 0 && (
                <div
                  ref={holdingsListRef}
                  className="max-h-64 overflow-y-auto pr-1 space-y-2 scroll-smooth"
                >
                  {sortedHoldings.map((holding) => {
                    const selectedStock: Stock | null =
                      holding.ticker && holding.market
                        ? {
                            market: holding.market,
                            ticker: holding.ticker,
                            name: holding.name,
                            currency: holding.currency,
                          }
                        : holding.name
                          ? {
                              market: "",
                              ticker: "",
                              name: holding.name,
                              currency: "",
                            }
                          : null;
                    const pricePoint =
                      holding.market && holding.ticker
                        ? prices.get(stockPriceKey(holding.market, holding.ticker))
                        : undefined;
                    const subtotal = pricePoint ? pricePoint.close * holding.quantity : null;
                    return (
                      <div
                        key={holding.id}
                        className="flex flex-wrap gap-2 items-center p-2 rounded-lg border"
                      >
                        <div className="flex items-center gap-1">
                          <StockCombobox
                            value={selectedStock}
                            onSelect={(stock) =>
                              handleSetStockHoldingFromSearch(item.id, holding.id, stock)
                            }
                            className="min-w-[140px]"
                          />
                          <span
                            className="ml-1 text-xs cursor-pointer underline"
                            onClick={() => handleRemoveStockHolding(item.id, holding.id)}
                          >
                            삭제
                          </span>
                        </div>
                        <div className="flex flex-1 flex-wrap justify-end items-center gap-2">
                          <div className="relative w-24">
                            <Input
                              type="text"
                              value={holding.quantity > 0 ? holding.quantity.toLocaleString() : ""}
                              onChange={(e) =>
                                handleUpdateStockHolding(
                                  item.id,
                                  holding.id,
                                  "quantity",
                                  e.target.value
                                )
                              }
                              placeholder="수량"
                              className="text-sm pr-7"
                            />
                            {holding.quantity > 0 && (
                              <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                                주
                              </div>
                            )}
                          </div>
                          {pricePoint ? (
                            <div className="flex gap-2 text-sm flex-wrap justify-end">
                              <span>주당: {pricePoint.close.toLocaleString()}원</span>
                              <span>평가: {numberToKorean(subtotal ?? 0)}</span>
                            </div>
                          ) : holding.market && holding.ticker ? (
                            <span className="text-sm text-muted-foreground">
                              {pricesLoading ? "..." : "가격 없음"}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">종목 미선택</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    현금 / 예수금
                  </span>
                  {cashItems.length > 0 && (
                    <span className="text-sm text-muted-foreground">
                      {numberToKorean(cashTotal)}
                    </span>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddCashModalOpen(true)}
                  className="h-7 text-xs"
                >
                  + 항목 추가
                </Button>
              </div>

              {cashItems.length > 0 && (
                <div
                  ref={cashListRef}
                  className="max-h-64 overflow-y-auto pr-1 space-y-2 scroll-smooth"
                >
                  {cashItems.map((cash) => (
                    <div
                      key={cash.id}
                      className="flex flex-wrap gap-2 items-center p-2 rounded-lg border"
                    >
                      <div className="flex items-center gap-1">
                        <Input
                          type="text"
                          value={cash.label}
                          onChange={(e) =>
                            handleUpdateCashItem(item.id, cash.id, "label", e.target.value)
                          }
                          placeholder="항목명"
                          className="text-sm w-32"
                        />
                        <span
                          className="ml-1 text-xs cursor-pointer underline"
                          onClick={() => handleRemoveCashItem(item.id, cash.id)}
                        >
                          삭제
                        </span>
                      </div>
                      <div className="relative flex-1 min-w-[140px]">
                        <Input
                          type="text"
                          value={cash.amount > 0 ? cash.amount.toLocaleString() : ""}
                          onChange={(e) =>
                            handleUpdateCashItem(item.id, cash.id, "amount", e.target.value)
                          }
                          placeholder="금액"
                          className="text-sm text-right pr-14"
                        />
                        {cash.amount > 0 && (
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                            {numberToKorean(cash.amount)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  히스토리
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddHistoryModalOpen(true)}
                  className="h-7 text-xs"
                >
                  + 기록 추가
                </Button>
              </div>

              {item.records.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {item.records
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map((record, index) => {
                      const isLatest = index === 0;
                      return (
                        <div
                          key={`${record.date}-${index}`}
                          className="flex flex-wrap sm:justify-between gap-2 sm:items-center p-2 rounded-lg border max-sm:flex-col"
                        >
                          <div className="text-sm">
                            {new Date(record.date).toLocaleDateString("ko-KR")}
                            {!isLatest && (
                              <span
                                className="ml-1 text-xs cursor-pointer underline"
                                onClick={() => onRemoveHistoryRecord(item.id, record.date)}
                              >
                                삭제
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex gap-2 text-sm flex-wrap">
                              <span>원금: {numberToKorean(record.initialInvestment)}</span>
                              <span>평가: {numberToKorean(record.currentValue)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            <div className="flex">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onRemoveInvestment(item.id)}
                className="text-xs ml-auto underline"
              >
                계좌 삭제
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      <AddHistoryModal
        isOpen={isAddHistoryModalOpen}
        onClose={() => setIsAddHistoryModalOpen(false)}
        item={item}
        onAddHistory={onAddHistory}
      />

      <AddStockHoldingModal
        isOpen={isAddHoldingModalOpen}
        onClose={() => setIsAddHoldingModalOpen(false)}
        accountName={item.accountName}
        existingHoldingKeys={existingHoldingKeys}
        onAdd={handleAddHoldingFromModal}
      />

      <AddCashItemModal
        isOpen={isAddCashModalOpen}
        onClose={() => setIsAddCashModalOpen(false)}
        accountName={item.accountName}
        onAdd={handleAddCashFromModal}
      />
    </Card>
  );
}
