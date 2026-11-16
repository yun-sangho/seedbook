"use client";

import { useState } from "react";
import { ConfirmDialog } from "@web/components/mobile/confirm-dialog";
import { formatMoneyDraft, sanitizePercentDraft } from "@web/components/mobile/input-format";
import { MoneyField } from "@web/components/mobile/money-field";
import { ACCOUNT_COLORS } from "@web/features/investments/types/constants";
import type { InvestmentItem, StockHolding } from "@web/features/investments/types/types";
import { DEFAULT_COMMISSION_PERCENT } from "@web/features/investments/utils/trade-cost";
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

/** 금액 하나를 고치는 시트 (투자원금, 현금성 자산). */
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

/**
 * 수수료율 입력을 읽는다. 비었으면 null (기본 수수료율), 0 이상 100 미만이 아니면 invalid
 * (저장하지 않음). 0 은 수수료 무료 계좌라 그대로 둔다.
 */
function parseCommissionDraft(
  draft: string
): { valid: true; percent: number | null } | { valid: false } {
  if (draft.trim() === "") return { valid: true, percent: null };
  const value = Number(draft);
  return Number.isFinite(value) && value >= 0 && value < 100
    ? { valid: true, percent: value }
    : { valid: false };
}

const draftOfRate = (percent: number | null | undefined) =>
  typeof percent === "number" ? String(percent) : "";

/** 계좌 이름 / 매매 수수료율 (주식, ETF·ETN) / 색상 / 삭제. */
export function AccountSettingsSheet({
  open,
  onOpenChange,
  item,
  onRename,
  onCommissionRatesChange,
  onColorChange,
  onDelete,
}: SheetProps & {
  item: InvestmentItem;
  onRename: (name: string) => void;
  onCommissionRatesChange: (rates: {
    stockCommissionPercent: number | null;
    etfCommissionPercent: number | null;
  }) => void;
  onColorChange: (color: string) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(item.accountName);
  const [stockDraft, setStockDraft] = useState(() => draftOfRate(item.stockCommissionPercent));
  const [etfDraft, setEtfDraft] = useState(() => draftOfRate(item.etfCommissionPercent));
  const stock = parseCommissionDraft(stockDraft);
  const etf = parseCommissionDraft(etfDraft);
  // ETF·ETN 칸을 비우면 주식 수수료율을 쓴다 — 그 값을 placeholder 로 보여 준다.
  const etfFallback =
    stock.valid && stock.percent !== null ? stock.percent : DEFAULT_COMMISSION_PERCENT;
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
              <TextField
                label="주식 수수료율"
                value={stockDraft}
                onValueChange={({ value }) => setStockDraft(sanitizePercentDraft(value))}
                suffix="%"
                invalid={!stock.valid}
                errorMessage={stock.valid ? undefined : "100% 미만으로 입력해 주세요"}
                description={`우대 수수료 등 이 계좌의 국내 주식 매매 수수료율이에요 (유관기관 제비용 포함). 비워 두면 ${DEFAULT_COMMISSION_PERCENT}% 로 계산해요.`}
              >
                <TextFieldInput
                  inputMode="decimal"
                  placeholder={String(DEFAULT_COMMISSION_PERCENT)}
                />
              </TextField>
              <TextField
                label="ETF·ETN 수수료율"
                value={etfDraft}
                onValueChange={({ value }) => setEtfDraft(sanitizePercentDraft(value))}
                suffix="%"
                invalid={!etf.valid}
                errorMessage={etf.valid ? undefined : "100% 미만으로 입력해 주세요"}
                description="우대 수수료는 ETF·ETN 이 주식과 다른 경우가 많아요 (예: 주식 0.0036396%, ETF·ETN 0.0042087%). 비워 두면 주식 수수료율을 써요. 매도할 때의 세금 — 코스피 주식은 증권거래세 0.05% + 농어촌특별세 0.15%, 코스닥 0.20%, ETF·ETN 은 없음 — 은 수수료와 따로 자동으로 계산해요."
              >
                <TextFieldInput inputMode="decimal" placeholder={String(etfFallback)} />
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
                if (!stock.valid || !etf.valid) return;
                onRename(name);
                if (
                  stock.percent !== (item.stockCommissionPercent ?? null) ||
                  etf.percent !== (item.etfCommissionPercent ?? null)
                ) {
                  onCommissionRatesChange({
                    stockCommissionPercent: stock.percent,
                    etfCommissionPercent: etf.percent,
                  });
                }
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
