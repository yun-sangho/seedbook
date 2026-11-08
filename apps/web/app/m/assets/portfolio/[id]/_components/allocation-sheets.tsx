"use client";

import { useRef, useState } from "react";
import { sanitizePercentDraft } from "@web/components/mobile/input-format";
import { StockSearchSheet } from "@web/features/investments/components/stock-search-sheet";
import type { Stock } from "@web/features/investments/types/stock";
import type { PortfolioAllocation } from "@web/features/portfolio/types/types";
import { ActionButton } from "@web/seed-design/ui/action-button";
import {
  BottomSheetBody,
  BottomSheetContent,
  BottomSheetFooter,
  BottomSheetRoot,
} from "@web/seed-design/ui/bottom-sheet";
import { TextField, TextFieldInput } from "@web/seed-design/ui/text-field";
import { parseNumericString } from "@web/utils/number-format";

function PercentField({
  value,
  onValueChange,
  remainingPercent,
}: {
  value: string;
  onValueChange: (value: string) => void;
  remainingPercent: number;
}) {
  return (
    <TextField
      label="목표 비중"
      value={value}
      onValueChange={({ value: next }) => onValueChange(sanitizePercentDraft(next))}
      suffix="%"
      description={`남은 비중 ${Math.max(0, remainingPercent).toFixed(1)}%`}
    >
      <TextFieldInput inputMode="decimal" placeholder="0" autoFocus />
    </TextField>
  );
}

/**
 * 종목 추가: 검색 → 비중 입력. 결과는 `addAllocation(portfolioId, {...stock, targetPercent})`.
 */
export function AddAllocationFlow({
  open,
  onOpenChange,
  disabledKeys,
  remainingPercent,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabledKeys: Set<string>;
  remainingPercent: number;
  onAdd: (stock: Stock, targetPercent: number) => void;
}) {
  const [stock, setStock] = useState<Stock | null>(null);
  const [percent, setPercent] = useState("");
  // 선택 직후 검색 시트가 이전 클로저(stock=null)로 onOpenChange(false) 를 불러 흐름 전체가
  // 닫히지 않도록 선택 여부는 ref 로 확인한다 (investment-sheets.tsx AddHoldingFlow 와 같은 이유).
  const selectedRef = useRef(false);

  const close = () => {
    selectedRef.current = false;
    setStock(null);
    setPercent("");
    onOpenChange(false);
  };

  const submit = () => {
    if (!stock) return;
    const parsed = percent === "" ? 0 : parseNumericString(percent);
    onAdd(stock, Number.isFinite(parsed) ? parsed : 0);
    close();
  };

  return (
    <>
      <StockSearchSheet
        open={open && !stock}
        onOpenChange={(next) => {
          if (!next && !selectedRef.current) close();
        }}
        onSelect={(selected) => {
          selectedRef.current = true;
          setStock(selected);
        }}
        disabledKeys={disabledKeys}
        title="종목 추가"
      />
      <BottomSheetRoot open={open && !!stock} onOpenChange={(next) => !next && close()}>
        <BottomSheetContent
          title={stock?.name ?? "목표 비중"}
          description={stock ? `${stock.market} · ${stock.ticker}` : undefined}
          showHandle
        >
          <BottomSheetBody>
            <PercentField
              value={percent}
              onValueChange={setPercent}
              remainingPercent={remainingPercent}
            />
          </BottomSheetBody>
          <BottomSheetFooter>
            <ActionButton size="large" className="w-full" onClick={submit}>
              추가하기
            </ActionButton>
          </BottomSheetFooter>
        </BottomSheetContent>
      </BottomSheetRoot>
    </>
  );
}

/** 기존 비중 수정 / 종목 삭제. 호출측이 `key={allocation.id}` 로 리마운트한다. */
export function EditAllocationSheet({
  open,
  onOpenChange,
  allocation,
  remainingPercent,
  onSave,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allocation: PortfolioAllocation;
  remainingPercent: number;
  onSave: (percent: string) => void;
  onDelete: () => void;
}) {
  const [percent, setPercent] = useState(
    allocation.targetPercent === 0 ? "" : String(allocation.targetPercent)
  );

  return (
    <BottomSheetRoot open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent
        title={allocation.name || "(종목 미선택)"}
        description={
          allocation.market && allocation.ticker
            ? `${allocation.market} · ${allocation.ticker}`
            : undefined
        }
        showHandle
      >
        <BottomSheetBody>
          <PercentField
            value={percent}
            onValueChange={setPercent}
            remainingPercent={remainingPercent + allocation.targetPercent}
          />
        </BottomSheetBody>
        <BottomSheetFooter>
          <div className="flex w-full gap-x2">
            <ActionButton
              variant="neutralWeak"
              size="large"
              onClick={() => {
                onDelete();
                onOpenChange(false);
              }}
            >
              삭제
            </ActionButton>
            <ActionButton
              size="large"
              flexGrow
              onClick={() => {
                onSave(percent);
                onOpenChange(false);
              }}
            >
              저장
            </ActionButton>
          </div>
        </BottomSheetFooter>
      </BottomSheetContent>
    </BottomSheetRoot>
  );
}
