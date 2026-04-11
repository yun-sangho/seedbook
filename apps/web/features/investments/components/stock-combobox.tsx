"use client";

import { forwardRef, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@web/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@web/components/ui/popover";
import { cn } from "@web/lib/utils";
import type { Stock } from "@web/features/investments/types/stock";
import { useStockSearch } from "@web/features/investments/utils/use-stock-search";

interface StockComboboxProps {
  value: Stock | null;
  onSelect: (stock: Stock) => void;
  placeholder?: string;
  className?: string;
  /** 이미 선택된 종목 키("market:ticker"). 이 목록의 종목은 검색 결과에서 비활성화된다. */
  disabledKeys?: Set<string>;
}

/**
 * 주식 종목 검색 콤보박스.
 *
 * - trigger: 선택된 종목의 이름 + "시장 · 종목코드" 뱃지.
 * - content: 200ms debounce 된 검색 결과 목록. 서버 사이드 필터링이므로
 *   cmdk 의 `shouldFilter={false}` 를 사용한다.
 * - 선택 시 onSelect 콜백 호출 후 팝오버 닫힘.
 */
export const StockCombobox = forwardRef<HTMLButtonElement, StockComboboxProps>(
  function StockCombobox(
    {
      value,
      onSelect,
      placeholder = "종목명 / 종목코드 검색",
      className,
      disabledKeys,
    },
    ref,
  ) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { results, isLoading, error } = useStockSearch(query);

  const handleSelect = (stock: Stock) => {
    onSelect(stock);
    setOpen(false);
    setQuery("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          ref={ref}
          type="button"
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-left text-sm hover:bg-accent/40",
            "min-h-[34px]",
            className,
          )}
        >
          {value ? (
            <>
              <span className="truncate font-medium">{value.name}</span>
              <span className="flex-shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {value.market} · {value.ticker}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[--radix-popover-trigger-width] min-w-[260px] p-0"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={placeholder}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {query.trim().length === 0 ? (
              <CommandEmpty>종목명 또는 종목코드를 입력하세요</CommandEmpty>
            ) : isLoading ? (
              <CommandEmpty>검색 중...</CommandEmpty>
            ) : error ? (
              <CommandEmpty>검색에 실패했습니다</CommandEmpty>
            ) : results.length === 0 ? (
              <CommandEmpty>검색 결과 없음</CommandEmpty>
            ) : (
              <CommandGroup>
                {results.map((stock) => {
                  const key = `${stock.market}:${stock.ticker}`;
                  const isDisabled = disabledKeys?.has(key) ?? false;
                  return (
                    <CommandItem
                      key={key}
                      value={key}
                      disabled={isDisabled}
                      onSelect={() => {
                        if (isDisabled) return;
                        handleSelect(stock);
                      }}
                      className={cn(
                        isDisabled &&
                          "opacity-50 cursor-not-allowed data-[disabled=true]:pointer-events-auto",
                      )}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <span className="truncate font-medium">
                          {stock.name}
                        </span>
                        {isDisabled && (
                          <span className="text-[10px] text-muted-foreground">
                            이미 추가됨
                          </span>
                        )}
                      </div>
                      <span className="flex-shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {stock.market} · {stock.ticker}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
  },
);
