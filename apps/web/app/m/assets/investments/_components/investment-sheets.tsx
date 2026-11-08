"use client";

import { useRef, useState } from "react";
import { IconCheckmarkFatFill } from "@karrotmarket/react-monochrome-icon";
import { Icon } from "@seed-design/react";
import { formatMoneyDraft } from "@web/components/mobile/input-format";
import { MoneyField } from "@web/components/mobile/money-field";
import { StockSearchSheet } from "@web/features/investments/components/stock-search-sheet";
import type { HoldingsSortOption } from "@web/features/investments/stores/investment-store";
import type { Stock } from "@web/features/investments/types/stock";
import type { AccountSortOption } from "@web/features/investments/utils/sort-accounts";
import { ActionButton } from "@web/seed-design/ui/action-button";
import {
  BottomSheetBody,
  BottomSheetContent,
  BottomSheetFooter,
  BottomSheetRoot,
} from "@web/seed-design/ui/bottom-sheet";
import { List, ListButtonItem } from "@web/seed-design/ui/list";
import { TextField, TextFieldInput } from "@web/seed-design/ui/text-field";
import { parseNumericString } from "@web/utils/number-format";

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export type SortOptionList<T extends string> = ReadonlyArray<{ value: T; label: string }>;

/** 계좌 안의 보유 종목 정렬 (store 에 저장, 데스크탑과 공유). */
export const HOLDINGS_SORT_OPTIONS: SortOptionList<HoldingsSortOption> = [
  { value: "default", label: "기본 순서" },
  { value: "priceDesc", label: "주당가 높은 순" },
  { value: "priceAsc", label: "주당가 낮은 순" },
  { value: "evalDesc", label: "평가액 높은 순" },
  { value: "evalAsc", label: "평가액 낮은 순" },
];

/** 투자 홈의 계좌 목록 정렬. */
export const ACCOUNT_SORT_OPTIONS: SortOptionList<AccountSortOption> = [
  { value: "default", label: "기본 순서" },
  { value: "evalDesc", label: "평가액 높은 순" },
  { value: "evalAsc", label: "평가액 낮은 순" },
];

export function sortOptionLabel<T extends string>(options: SortOptionList<T>, value: T): string {
  return options.find((o) => o.value === value)?.label ?? "기본 순서";
}

export function SortSheet<T extends string>({
  open,
  onOpenChange,
  title,
  options,
  value,
  onChange,
}: SheetProps & {
  title: string;
  options: SortOptionList<T>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <BottomSheetRoot open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent title={title} showHandle>
        <BottomSheetBody>
          <List>
            {options.map((option) => (
              <ListButtonItem
                key={option.value}
                title={option.label}
                suffix={
                  option.value === value ? (
                    <Icon svg={<IconCheckmarkFatFill />} color="fg.brand" />
                  ) : undefined
                }
                onClick={() => {
                  onChange(option.value);
                  onOpenChange(false);
                }}
              />
            ))}
          </List>
        </BottomSheetBody>
      </BottomSheetContent>
    </BottomSheetRoot>
  );
}

/**
 * 종목 추가: 검색 시트에서 종목을 고르면 수량 입력 시트로 넘어간다.
 */
export function AddHoldingFlow({
  open,
  onOpenChange,
  existingHoldingKeys,
  onAdd,
}: SheetProps & {
  existingHoldingKeys: Set<string>;
  onAdd: (stock: Stock, quantity: number) => void;
}) {
  const [stock, setStock] = useState<Stock | null>(null);
  // 종목을 고르면 수량 시트가 열리며 포커스가 넘어가고, 검색 시트는 "바깥 포커스"로 닫히며
  // onOpenChange(false) 를 부른다. 그 콜백은 선택 전 렌더의 클로저(stock=null)일 수 있어
  // 흐름 전체를 닫아버리므로, 선택 여부는 ref 로 바로 확인한다.
  const selectedRef = useRef(false);
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<string>();

  const close = () => {
    selectedRef.current = false;
    setStock(null);
    setQuantity("");
    setError(undefined);
    onOpenChange(false);
  };

  const submit = () => {
    const parsed = parseNumericString(quantity);
    if (!stock) return;
    if (!quantity || !(parsed > 0)) {
      setError("수량을 올바르게 입력해주세요.");
      return;
    }
    onAdd(stock, parsed);
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
        disabledKeys={existingHoldingKeys}
        title="종목 추가"
      />
      <BottomSheetRoot open={open && !!stock} onOpenChange={(next) => !next && close()}>
        <BottomSheetContent
          title={stock?.name ?? "수량 입력"}
          description={stock ? `${stock.market} · ${stock.ticker}` : undefined}
          showHandle
        >
          <BottomSheetBody>
            <TextField
              label="보유 수량"
              value={quantity}
              onValueChange={({ value }) => setQuantity(formatMoneyDraft(value))}
              suffix="주"
              invalid={!!error}
              errorMessage={error}
            >
              <TextFieldInput inputMode="numeric" placeholder="0" autoFocus />
            </TextField>
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

export function AddHistorySheet({
  open,
  onOpenChange,
  onAdd,
}: SheetProps & {
  onAdd: (date: string, initialInvestment: number, currentValue: number) => void;
}) {
  const today = new Date().toISOString().split("T")[0] ?? "";
  const [date, setDate] = useState(today);
  const [initial, setInitial] = useState("");
  const [current, setCurrent] = useState("");
  const [errors, setErrors] = useState<{ date?: string; current?: string }>({});

  const close = () => {
    setDate(today);
    setInitial("");
    setCurrent("");
    setErrors({});
    onOpenChange(false);
  };

  const submit = () => {
    const next: typeof errors = {};
    if (!date) next.date = "날짜를 선택해주세요.";
    else if (new Date(date) > new Date()) next.date = "미래 날짜는 선택할 수 없습니다.";
    const currentValue = parseNumericString(current);
    if (!current || !(currentValue > 0)) next.current = "평가금액을 입력해주세요.";
    setErrors(next);
    if (next.date || next.current) return;
    const initialValue = initial ? parseNumericString(initial) : 0;
    onAdd(date, initialValue, currentValue);
    close();
  };

  return (
    <BottomSheetRoot open={open} onOpenChange={(next) => !next && close()}>
      <BottomSheetContent title="기록 추가" showHandle>
        <BottomSheetBody>
          <div className="flex flex-col gap-x4">
            <TextField
              label="기준 날짜"
              value={date}
              onValueChange={({ value }) => setDate(value)}
              invalid={!!errors.date}
              errorMessage={errors.date}
            >
              <TextFieldInput type="date" max={today} />
            </TextField>
            <MoneyField label="투자원금" value={initial} onValueChange={setInitial} />
            <MoneyField
              label="평가금액"
              value={current}
              onValueChange={setCurrent}
              errorMessage={errors.current}
            />
          </div>
        </BottomSheetBody>
        <BottomSheetFooter>
          <ActionButton size="large" className="w-full" onClick={submit}>
            추가하기
          </ActionButton>
        </BottomSheetFooter>
      </BottomSheetContent>
    </BottomSheetRoot>
  );
}
