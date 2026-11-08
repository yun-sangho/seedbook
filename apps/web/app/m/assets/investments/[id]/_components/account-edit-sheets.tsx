"use client";

import { useState } from "react";
import { ConfirmDialog } from "@web/components/mobile/confirm-dialog";
import { formatMoneyDraft } from "@web/components/mobile/input-format";
import { MoneyField } from "@web/components/mobile/money-field";
import { ACCOUNT_COLORS } from "@web/features/investments/types/constants";
import type { InvestmentItem, StockHolding } from "@web/features/investments/types/types";
import { cn } from "@web/lib/utils";
import { ActionButton } from "@web/seed-design/ui/action-button";
import {
  BottomSheetBody,
  BottomSheetContent,
  BottomSheetFooter,
  BottomSheetRoot,
} from "@web/seed-design/ui/bottom-sheet";
import { TextField, TextFieldInput } from "@web/seed-design/ui/text-field";
import { numberToKorean, parseNumericString } from "@web/utils/number-format";

/*
 * 편집 시트들은 열릴 때마다 대상의 현재 값으로 폼을 초기화해야 한다.
 * 호출측이 `key` 로 대상 id 를 넘겨 리마운트시키는 방식을 쓴다.
 */

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function toDraft(value: number): string {
  return value > 0 ? value.toLocaleString() : "";
}

function SheetActions({ onSave, onDelete }: { onSave: () => void; onDelete?: () => void }) {
  return (
    <div className="flex w-full gap-x2">
      {onDelete && (
        <ActionButton variant="neutralWeak" size="large" onClick={onDelete}>
          삭제
        </ActionButton>
      )}
      <ActionButton size="large" flexGrow onClick={onSave}>
        저장
      </ActionButton>
    </div>
  );
}

/** 금액 하나를 고치는 시트 (투자원금, 예수금). */
export function EditAmountSheet({
  open,
  onOpenChange,
  title,
  description,
  value,
  onSave,
}: SheetProps & {
  title: string;
  description?: string;
  value: number;
  onSave: (value: string) => void;
}) {
  const [draft, setDraft] = useState(() => toDraft(value));
  return (
    <BottomSheetRoot open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent title={title} description={description} showHandle>
        <BottomSheetBody>
          <MoneyField ariaLabel={title} value={draft} onValueChange={setDraft} autoFocus />
        </BottomSheetBody>
        <BottomSheetFooter>
          <SheetActions
            onSave={() => {
              onSave(draft);
              onOpenChange(false);
            }}
          />
        </BottomSheetFooter>
      </BottomSheetContent>
    </BottomSheetRoot>
  );
}

export function EditHoldingSheet({
  open,
  onOpenChange,
  holding,
  price,
  onSave,
  onDelete,
}: SheetProps & {
  holding: StockHolding;
  price: number | null;
  onSave: (quantity: string) => void;
  onDelete: () => void;
}) {
  const [quantity, setQuantity] = useState(() => toDraft(holding.quantity));
  const parsed = parseNumericString(quantity);
  const subtotal = price !== null && parsed > 0 ? price * parsed : null;

  return (
    <BottomSheetRoot open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent
        title={holding.name || holding.ticker || "종목"}
        description={
          holding.market && holding.ticker ? `${holding.market} · ${holding.ticker}` : undefined
        }
        showHandle
      >
        <BottomSheetBody>
          <TextField
            label="보유 수량"
            value={quantity}
            onValueChange={({ value }) => setQuantity(formatMoneyDraft(value))}
            suffix="주"
            description={
              price === null
                ? "시세 정보 없음"
                : `주당 ${price.toLocaleString()}원${subtotal !== null ? ` · 평가 ${numberToKorean(subtotal)}` : ""}`
            }
          >
            <TextFieldInput inputMode="numeric" placeholder="0" autoFocus />
          </TextField>
        </BottomSheetBody>
        <BottomSheetFooter>
          <SheetActions
            onSave={() => {
              onSave(quantity);
              onOpenChange(false);
            }}
            onDelete={() => {
              onDelete();
              onOpenChange(false);
            }}
          />
        </BottomSheetFooter>
      </BottomSheetContent>
    </BottomSheetRoot>
  );
}

/** 계좌 이름 / 색상 / 삭제. */
export function AccountSettingsSheet({
  open,
  onOpenChange,
  item,
  onRename,
  onColorChange,
  onDelete,
}: SheetProps & {
  item: InvestmentItem;
  onRename: (name: string) => void;
  onColorChange: (color: string) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(item.accountName);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <BottomSheetRoot open={open} onOpenChange={onOpenChange}>
        <BottomSheetContent title="계좌 수정" showHandle>
          <BottomSheetBody>
            <div className="flex flex-col gap-x5">
              <TextField
                label="계좌 이름"
                value={name}
                onValueChange={({ value }) => setName(value)}
              >
                <TextFieldInput placeholder="계좌 이름" />
              </TextField>
              <div>
                <p className="t4-medium text-fg-neutral mb-x2">색상</p>
                <div className="flex flex-wrap gap-x2">
                  {ACCOUNT_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={`색상 ${color}`}
                      aria-pressed={item.color === color}
                      onClick={() => onColorChange(color)}
                      className={cn(
                        "size-x8 rounded-full border-2",
                        item.color === color
                          ? "border-stroke-neutral-contrast"
                          : "border-transparent"
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </BottomSheetBody>
          <BottomSheetFooter>
            <SheetActions
              onSave={() => {
                onRename(name);
                onOpenChange(false);
              }}
              onDelete={() => setConfirmOpen(true)}
            />
          </BottomSheetFooter>
        </BottomSheetContent>
      </BottomSheetRoot>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`"${item.accountName}" 계좌를 삭제할까요?`}
        description="보유 종목, 현금, 기록이 모두 삭제됩니다."
        onConfirm={() => {
          onDelete();
          onOpenChange(false);
        }}
      />
    </>
  );
}
