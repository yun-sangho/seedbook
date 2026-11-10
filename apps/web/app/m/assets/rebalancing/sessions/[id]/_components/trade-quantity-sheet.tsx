"use client";

import { useMemo, useState } from "react";
import { IconMinusLine, IconPlusLine } from "@karrotmarket/react-monochrome-icon";
import { Icon } from "@seed-design/react";
import { formatMoneyDraft } from "@web/components/mobile/input-format";
import type { StockHolding } from "@web/features/investments/types/types";
import {
  snapToTick,
  stepByTick,
  tickSize,
  type SecurityType,
} from "@web/features/investments/utils/krx-tick-size";
import { stockPriceKey, useStockPrices } from "@web/features/investments/utils/use-stock-prices";
import type { RebalancingTask } from "@web/features/rebalancing/types/types";
import { ActionButton } from "@web/seed-design/ui/action-button";
import {
  BottomSheetBody,
  BottomSheetContent,
  BottomSheetFooter,
  BottomSheetRoot,
} from "@web/seed-design/ui/bottom-sheet";
import { Callout } from "@web/seed-design/ui/callout";
import { TextField, TextFieldInput } from "@web/seed-design/ui/text-field";
import { formatWithCommas, parseNumericString } from "@web/utils/number-format";

/**
 * 매매 하나를 실제로 사고판 수량과 가격으로 기록하는 시트. 예수금은 이 수량 × 가격으로
 * 계산하므로 둘 다 실제 체결값을 넣어야 한다. 가격은 호가 단위(ETF 5원 등)에 맞춘다 —
 * −/+ 는 한 호가씩 움직이고, 직접 입력한 값은 입력을 마치면 가장 가까운 호가로 맞춘다.
 *
 * - 남은 매매(`mode: "check"`): 권장 수량과 시작 시점 가격(또는 직전에 기록했던 값)이 채워져
 *   있고, 실제 값으로 고쳐 "매매 완료" 를 누르면 완료로 기록한다.
 * - 완료한 매매(`mode: "edit"`): 기록한 값을 고치거나 "완료 취소" 로 남은 매매로 되돌린다.
 *
 * 권장 수량과 가격은 리밸런싱을 시작할 때 고정된 값이다. 열 때마다 대상 값으로 초기화되도록
 * 호출측이 `key` 로 리마운트한다.
 */
export function TradeQuantitySheet({
  task,
  mode,
  initialQuantity,
  initialPrice,
  open,
  onOpenChange,
  onConfirm,
  onUncheck,
}: {
  task: RebalancingTask;
  mode: "check" | "edit";
  /** 입력 칸에 미리 채울 수량. 모르면 null (빈 칸). */
  initialQuantity: number | null;
  /** 가격 칸에 미리 채울 주당 가격. 모르면 null (빈 칸). */
  initialPrice: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (quantity: number, price: number) => void;
  onUncheck: () => void;
}) {
  const [draft, setDraft] = useState(() =>
    initialQuantity !== null && initialQuantity > 0 ? initialQuantity.toLocaleString() : ""
  );
  const [priceDraft, setPriceDraft] = useState(() =>
    initialPrice !== null && initialPrice > 0 ? formatWithCommas(initialPrice) : ""
  );
  const quantity = parseNumericString(draft);
  const price = parseNumericString(priceDraft);
  const securityType = useSecurityType(task);
  const tick = priceValid(price) ? tickSize(price, securityType) : null;
  const quantityValid = Number.isFinite(quantity) && quantity > 0;
  const priceOk = priceValid(price);
  const valid = quantityValid && priceOk;
  const setPrice = (next: number) => setPriceDraft(formatWithCommas(next));
  // 권장 수량은 시작할 때 계산한 계획이다 — 다르게 사고팔면 그 차이는 다른 매매에 반영되지 않는다.
  const differs = quantityValid && task.quantity !== null && quantity !== task.quantity;
  const name = task.name || task.ticker || "종목";

  const close = (action: () => void) => {
    action();
    onOpenChange(false);
  };

  return (
    <BottomSheetRoot open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent
        // 제목이 두 줄이 되면 본문(입력 칸)이 밀려 잘린다 — 종목명은 한 줄로 줄이고,
        // 매도/매수 구분은 설명 줄에 둔다.
        title={<span className="block truncate">{name}</span>}
        description={headerDescription(task, mode)}
        showHandle
      >
        <BottomSheetBody>
          <TextField
            label={`실제 ${task.action}한 수량`}
            value={draft}
            onValueChange={({ value }) => setDraft(formatMoneyDraft(value))}
            suffix="주"
          >
            <TextFieldInput inputMode="numeric" placeholder="0" autoFocus />
          </TextField>
          <div className="mt-x4">
            <p className="t4-medium mb-x2">실제 {task.action}한 가격 (주당)</p>
            <div className="flex items-center gap-x2">
              <ActionButton
                variant="neutralWeak"
                size="large"
                layout="iconOnly"
                aria-label="한 호가 내리기"
                disabled={!priceOk}
                onClick={() => setPrice(stepByTick(price, -1, securityType))}
              >
                <Icon svg={<IconMinusLine />} />
              </ActionButton>
              <div className="min-w-0 flex-1">
                <TextField
                  value={priceDraft}
                  onValueChange={({ value }) => setPriceDraft(formatMoneyDraft(value))}
                  suffix="원"
                >
                  <TextFieldInput
                    aria-label={`실제 ${task.action}한 가격 (주당)`}
                    inputMode="numeric"
                    placeholder="0"
                    className="text-center"
                    // 직접 입력한 값은 입력을 마치면 가장 가까운 호가로 맞춘다.
                    onBlur={() => priceOk && setPrice(snapToTick(price, securityType))}
                  />
                </TextField>
              </div>
              <ActionButton
                variant="neutralWeak"
                size="large"
                layout="iconOnly"
                aria-label="한 호가 올리기"
                disabled={!priceOk}
                onClick={() => setPrice(stepByTick(price, 1, securityType))}
              >
                <Icon svg={<IconPlusLine />} />
              </ActionButton>
            </div>
            <p className="t3-regular text-fg-neutral-subtle mt-x2 tabular-nums">
              {priceHint(task, tick, quantityValid ? quantity : null, priceOk ? price : null)}
            </p>
          </div>
          {differs && (
            <Callout
              tone="warning"
              className="mt-x3"
              description={`권장 ${formatWithCommas(task.quantity ?? 0)}주와 달라요. 차이만큼 다른 매매에서 예수금이 모자라거나 남을 수 있어요.`}
            />
          )}
        </BottomSheetBody>
        <BottomSheetFooter>
          <div className="flex w-full gap-x2">
            {mode === "edit" && (
              <ActionButton variant="neutralWeak" size="large" onClick={() => close(onUncheck)}>
                완료 취소
              </ActionButton>
            )}
            <ActionButton
              size="large"
              flexGrow
              disabled={!valid}
              // 입력칸에서 바로 완료를 눌러도 호가에 맞춘 값으로 기록한다.
              onClick={() => close(() => onConfirm(quantity, snapToTick(price, securityType)))}
            >
              {mode === "check" ? "매매 완료" : "저장"}
            </ActionButton>
          </div>
        </BottomSheetFooter>
      </BottomSheetContent>
    </BottomSheetRoot>
  );
}

function headerDescription(task: RebalancingTask, mode: "check" | "edit"): string {
  if (mode === "edit") return `${task.action} 완료 · 실제로 사고판 수량과 가격으로 고칠 수 있어요`;
  if (task.quantity === null) return task.action;
  const basis = task.price !== null ? ` · ${formatWithCommas(task.price)}원 기준` : "";
  return `${task.action} · 권장 ${formatWithCommas(task.quantity)}주${basis}`;
}

const priceValid = (value: number) => Number.isFinite(value) && value > 0;

/** 종목 종류 (호가 단위용). 시세 API 가 함께 내려준다 — 모르면 null 이고 단위를 맞추지 않는다. */
function useSecurityType(task: RebalancingTask): SecurityType {
  const holdings = useMemo<StockHolding[]>(
    () => [
      {
        id: task.id,
        market: task.market,
        ticker: task.ticker,
        name: task.name,
        currency: "KRW",
        quantity: 0,
        memo: "",
      },
    ],
    [task.id, task.market, task.ticker, task.name]
  );
  const { prices } = useStockPrices(holdings);
  return prices.get(stockPriceKey(task.market, task.ticker))?.securityType ?? null;
}

/**
 * 가격 칸 아래: "호가 5원 · 총 4,608,545원 · 시작 시점 기준가 13,205원". 총액은 예수금에 반영될 금액.
 * 호가 단위를 모르면 그 부분은 뺀다.
 */
function priceHint(
  task: RebalancingTask,
  tick: number | null,
  quantity: number | null,
  price: number | null
): string {
  const parts: string[] = [];
  if (tick !== null) parts.push(`호가 ${formatWithCommas(tick)}원`);
  if (quantity !== null && price !== null) {
    parts.push(`총 ${formatWithCommas(Math.round(quantity * price))}원`);
  }
  if (task.price !== null && price !== task.price) {
    parts.push(`시작 시점 기준가 ${formatWithCommas(task.price)}원`);
  }
  if (price === null) parts.push("체결된 주당 가격을 입력하세요");
  return parts.join(" · ");
}
