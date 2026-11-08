"use client";

import { useState } from "react";
import {
  BottomSheetBody,
  BottomSheetContent,
  BottomSheetRoot,
} from "@web/seed-design/ui/bottom-sheet";
import { List, ListButtonItem } from "@web/seed-design/ui/list";
import { SearchInput } from "@web/seed-design/ui/search-input";
import type { Stock } from "../types/stock";
import { useStockSearch } from "../utils/use-stock-search";

interface StockSearchSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (stock: Stock) => void;
  /** 이미 선택된 종목 키 ("market:ticker"). 결과에서 비활성화된다. */
  disabledKeys?: Set<string>;
  title?: string;
}

/**
 * 모바일 종목 검색 바텀시트. 데스크탑 `StockCombobox` 의 모바일 대응.
 * 검색은 서버 사이드 (`useStockSearch`, debounce 포함).
 */
export function StockSearchSheet({
  open,
  onOpenChange,
  onSelect,
  disabledKeys,
  title = "종목 검색",
}: StockSearchSheetProps) {
  const [query, setQuery] = useState("");
  const { results, isLoading, error } = useStockSearch(query);

  const handleOpenChange = (next: boolean) => {
    if (!next) setQuery("");
    onOpenChange(next);
  };

  const trimmed = query.trim();
  const emptyMessage =
    trimmed.length === 0
      ? "종목명 또는 종목코드를 입력하세요"
      : isLoading
        ? "검색 중..."
        : error
          ? "검색에 실패했습니다"
          : results.length === 0
            ? "검색 결과 없음"
            : null;

  return (
    <BottomSheetRoot open={open} onOpenChange={handleOpenChange}>
      <BottomSheetContent title={title} showHandle className="!max-h-[90dvh]">
        <BottomSheetBody>
          <div className="pb-x2">
            <SearchInput
              value={query}
              onValueChange={(next) => setQuery(next)}
              placeholder="종목명 / 종목코드"
              inputProps={{ autoFocus: true }}
            />
          </div>
          <div className="min-h-[40dvh]">
            {emptyMessage ? (
              <p className="t4-regular text-fg-neutral-subtle py-x8 text-center">{emptyMessage}</p>
            ) : (
              <List>
                {results.map((stock) => {
                  const key = `${stock.market}:${stock.ticker}`;
                  const disabled = disabledKeys?.has(key) ?? false;
                  return (
                    <ListButtonItem
                      key={key}
                      title={stock.name}
                      detail={
                        disabled
                          ? `${stock.market} · ${stock.ticker} · 이미 추가됨`
                          : `${stock.market} · ${stock.ticker}`
                      }
                      disabled={disabled}
                      onClick={() => {
                        onSelect(stock);
                        handleOpenChange(false);
                      }}
                    />
                  );
                })}
              </List>
            )}
          </div>
        </BottomSheetBody>
      </BottomSheetContent>
    </BottomSheetRoot>
  );
}
