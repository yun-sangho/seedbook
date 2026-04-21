"use client";

import { Button } from "@web/components/ui/button";
import { Input } from "@web/components/ui/input";
import { StockCombobox } from "@web/features/investments/components/stock-combobox";
import type { Stock } from "@web/features/investments/types/stock";
import { Trash2 } from "lucide-react";
import type { PortfolioAllocation } from "../types/types";

interface PortfolioAllocationRowProps {
  allocation: PortfolioAllocation;
  /** 이미 선택된 다른 종목 키 ("market:ticker"). 콤보박스에서 disable 됨. */
  disabledKeys: Set<string>;
  onSelectStock: (allocationId: string, stock: Stock) => void;
  onChangePercent: (allocationId: string, value: string) => void;
  onRemove: (allocationId: string) => void;
}

export function PortfolioAllocationRow({
  allocation,
  disabledKeys,
  onSelectStock,
  onChangePercent,
  onRemove,
}: PortfolioAllocationRowProps) {
  const stockValue: Stock | null = allocation.ticker
    ? {
        market: allocation.market,
        ticker: allocation.ticker,
        name: allocation.name,
        currency: allocation.currency,
      }
    : null;

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <StockCombobox
          value={stockValue}
          onSelect={(s) => onSelectStock(allocation.id, s)}
          disabledKeys={disabledKeys}
        />
      </div>
      <div className="flex items-center gap-1 w-32">
        <Input
          type="text"
          inputMode="decimal"
          className="text-right font-medium"
          value={allocation.targetPercent === 0 ? "" : String(allocation.targetPercent)}
          onChange={(e) => onChangePercent(allocation.id, e.target.value)}
          placeholder="0"
        />
        <span className="text-sm text-muted-foreground">%</span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="삭제"
        onClick={() => onRemove(allocation.id)}
        className="text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
