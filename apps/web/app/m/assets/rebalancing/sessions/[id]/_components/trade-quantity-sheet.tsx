"use client";

import { useState } from "react";
import { formatMoneyDraft } from "@web/components/mobile/input-format";
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
 * 매매 하나를 실제로 사고판 수량으로 기록하는 시트.
 *
 * - 남은 매매(`mode: "check"`): 권장 수량(또는 직전에 기록했던 수량)이 채워져 있고, 실제 수량으로
 *   고쳐 "매매 완료" 를 누르면 완료로 기록한다.
 * - 완료한 매매(`mode: "edit"`): 기록한 수량을 고치거나 "완료 취소" 로 남은 매매로 되돌린다.
 *
 * 권장 수량과 가격은 리밸런싱을 시작할 때 고정된 값이다. 열 때마다 대상 값으로 초기화되도록
 * 호출측이 `key` 로 리마운트한다.
 */
export function TradeQuantitySheet({
  task,
  mode,
  initialQuantity,
  open,
  onOpenChange,
  onConfirm,
  onUncheck,
}: {
  task: RebalancingTask;
  mode: "check" | "edit";
  /** 입력 칸에 미리 채울 수량. 모르면 null (빈 칸). */
  initialQuantity: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (quantity: number) => void;
  onUncheck: () => void;
}) {
  const [draft, setDraft] = useState(() =>
    initialQuantity !== null && initialQuantity > 0 ? initialQuantity.toLocaleString() : ""
  );
  const quantity = parseNumericString(draft);
  const valid = Number.isFinite(quantity) && quantity > 0;
  // 권장 수량은 시작할 때 계산한 계획이다 — 다르게 사고팔면 그 차이는 다른 매매에 반영되지 않는다.
  const differs = valid && task.quantity !== null && quantity !== task.quantity;
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
            description={amountLabel(task, valid ? quantity : null)}
          >
            <TextFieldInput inputMode="numeric" placeholder="0" autoFocus />
          </TextField>
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
              onClick={() => close(() => onConfirm(quantity))}
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
  if (mode === "edit") return `${task.action} 완료 · 실제로 사고판 수량으로 고칠 수 있어요`;
  if (task.quantity === null) return task.action;
  const basis = task.price !== null ? ` · ${formatWithCommas(task.price)}원 기준` : "";
  return `${task.action} · 권장 ${formatWithCommas(task.quantity)}주${basis}`;
}

function amountLabel(task: RebalancingTask, quantity: number | null): string {
  if (task.price === null) return "가격 정보 없음";
  const perShare = `주당 ${formatWithCommas(task.price)}원`;
  if (quantity === null) return perShare;
  return `${perShare} · ${formatWithCommas(Math.round(quantity * task.price))}원`;
}
