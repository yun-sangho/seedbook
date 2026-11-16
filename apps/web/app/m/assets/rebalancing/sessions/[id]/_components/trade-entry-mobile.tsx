"use client";

import { type ReactNode, useState } from "react";
import { IconMinusLine, IconPlusLine } from "@karrotmarket/react-monochrome-icon";
import { Icon } from "@seed-design/react";
import { useFlow } from "@stackflow/react";
import { formatMoneyDraft } from "@web/components/mobile/input-format";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { snapToTick, stepByTick, tickSize } from "@web/features/investments/utils/krx-tick-size";
import { type SellTax, sellTaxOf } from "@web/features/investments/utils/sell-tax";
import { useRebalancingStore } from "@web/features/rebalancing/stores/rebalancing-store";
import type { RebalancingTask, RebalancingTaskStatus } from "@web/features/rebalancing/types/types";
import { sellTaxForTasks } from "@web/features/rebalancing/utils/apply-rebalancing-to-account";
import {
  isRebalancingCompleted,
  rebalancingTaskStatus,
} from "@web/features/rebalancing/utils/rebalancing-session";
import { tradeCashPreview } from "@web/features/rebalancing/utils/trade-cash-check";
import { useTaskSecurityTypes } from "@web/features/rebalancing/utils/use-task-security-types";
import { cn } from "@web/lib/utils";
import { ActionButton } from "@web/seed-design/ui/action-button";
import { ResultSection } from "@web/seed-design/ui/result-section";
import { TextField, TextFieldInput } from "@web/seed-design/ui/text-field";
import { formatWithCommas, parseNumericString } from "@web/utils/number-format";
import { markJustMoved } from "./just-moved-tasks";

/**
 * 매매 하나의 주문과 체결을 기록하는 화면 (대기 → 주문 → 체결).
 *
 * - 대기: 증권사에 넣은 주문 수량·주문가를 "주문 기록" 으로 남긴다. 시장가처럼 바로 체결됐으면
 *   "바로 체결" 로 건너뛴다.
 * - 주문: 주문 값이 채워져 있어 대부분 그대로 "체결 기록" 만 누른다. "주문 취소" 로 대기로 돌린다.
 *   주문 내역의 "정정" 으로 주문 수량·주문가를 고친다 (증권사 앱의 정정/취소와 같은 흐름). 정정은
 *   따로 들어가야 한다 — 체결 입력을 주문과 다르게 고친 게 정정인지 다른 값으로 체결된 건지 알 수 없다.
 * - 체결: 기록한 값을 고치거나 "체결 취소" 로 주문(또는 대기)으로 되돌린다.
 *
 * 체결은 실제로 사고판 수량과 체결 가격으로 기록한다. 예수금은 이 수량 × 가격으로
 * 계산하므로 둘 다 실제 체결값을 넣어야 한다 — 실수하면 안 되는 입력이라 시트가 아니라 화면으로 둔다
 * (키보드가 올라와도 공간이 넉넉하고, 쓸어내려 실수로 닫히지 않는다).
 *
 * - 가격은 호가 단위(ETF 5원 등)에 맞춘다. −/+ 는 한 호가씩, 직접 입력은 입력을 마치면 가장 가까운
 *   호가로 맞춘다.
 * - 이 매매까지 반영한 예수금이 마이너스면 주문·체결을 기록할 수 없다 (체결 전 매수 주문 금액은
 *   예수금에서 묶인 것으로 본다).
 * - 대기 중인 매매는 권장 수량과 시작 시점 가격(이전에 체결을 기록했다 취소했으면 그 값)으로 채운다.
 */
export function TradeEntryMobile({ sessionId, taskId }: { sessionId: string; taskId: string }) {
  const session = useRebalancingStore((s) => s.sessions.find((x) => x.id === sessionId));
  const task = session?.tasks.find((t) => t.id === taskId);
  const { pop } = useFlow();

  if (!session || !task) {
    return (
      <div className="flex min-h-[60dvh] flex-col">
        <ResultSection
          title="매매를 찾을 수 없어요"
          description="삭제되었거나 잘못된 링크일 수 있습니다."
          primaryActionProps={{ children: "돌아가기", onClick: () => pop() }}
        />
      </div>
    );
  }
  if (isRebalancingCompleted(session)) {
    return (
      <div className="flex min-h-[60dvh] flex-col">
        <ResultSection
          title="끝난 리밸런싱이에요"
          description="완료하거나 종료한 리밸런싱의 매매는 고칠 수 없어요."
          primaryActionProps={{ children: "돌아가기", onClick: () => pop() }}
        />
      </div>
    );
  }
  // 다른 매매로 바꿔 들어오면 입력을 새로 채운다.
  return <TradeEntryForm key={task.id} sessionId={session.id} task={task} />;
}

function TradeEntryForm({ sessionId, task }: { sessionId: string; task: RebalancingTask }) {
  const session = useRebalancingStore((s) => s.sessions.find((x) => x.id === sessionId))!;
  const completeTaskWith = useRebalancingStore((s) => s.completeTaskWith);
  const orderTaskWith = useRebalancingStore((s) => s.orderTaskWith);
  const cancelTaskOrder = useRebalancingStore((s) => s.cancelTaskOrder);
  const toggleTask = useRebalancingStore((s) => s.toggleTask);
  const status = rebalancingTaskStatus(task);
  const account = useInvestmentStore((s) =>
    s.investments.find((inv) => inv.id === session.accountId)
  );
  const { pop } = useFlow();

  // 주문했으면 주문 값으로, 아니면 기록한 체결 값(체결을 취소해도 남아 있다)이나 권장 값으로 채운다.
  const [quantityDraft, setQuantityDraft] = useState(() =>
    draftOf(status === "ordered" ? task.orderedQuantity : (task.executedQuantity ?? task.quantity))
  );
  const [priceDraft, setPriceDraft] = useState(() =>
    draftOf(status === "ordered" ? task.orderedPrice : (task.executedPrice ?? task.price))
  );
  // 주문 정정 중 — 입력 칸이 체결 값이 아니라 주문 값을 고친다.
  const [amending, setAmending] = useState(false);
  const quantity = parseNumericString(quantityDraft);
  const price = parseNumericString(priceDraft);
  const quantityOk = isPositive(quantity);
  const priceOk = isPositive(price);
  const securityTypeOf = useTaskSecurityTypes(session.tasks);
  const securityType = securityTypeOf(task);
  const tick = priceOk ? tickSize(price, securityType) : null;
  // 기록할 가격은 호가에 맞춘 값이다 — 금액과 예수금도 그 값으로 계산한다.
  const tradePrice = priceOk ? snapToTick(price, securityType) : null;
  const amount = quantityOk && tradePrice !== null ? Math.round(quantity * tradePrice) : null;
  // 매도 세금 (매수에는 없다). 수수료는 계좌마다 달라 계산하지 않는다.
  const sellTax =
    task.action === "매도" && amount !== null ? sellTaxOf(task.market, securityType, amount) : null;
  // 계좌가 지워졌으면 예수금을 알 수 없어 확인하지 않는다.
  const cash =
    account && quantityOk && tradePrice !== null
      ? tradeCashPreview(
          account,
          session,
          task.id,
          quantity,
          tradePrice,
          sellTaxForTasks(securityTypeOf)
        )
      : null;
  const shortOfCash = cash !== null && cash.after < 0;
  const canSave = quantityOk && tradePrice !== null && !shortOfCash;
  const differs = quantityOk && task.quantity !== null && quantity !== task.quantity;
  const setPrice = (next: number) => setPriceDraft(formatWithCommas(next));

  const recordFill = () => {
    if (!canSave || tradePrice === null) return;
    if (status !== "filled") markJustMoved(task.id, status);
    completeTaskWith(session.id, task.id, quantity, tradePrice);
    pop();
  };
  const recordOrder = () => {
    if (!canSave || tradePrice === null) return;
    markJustMoved(task.id, "pending");
    orderTaskWith(session.id, task.id, quantity, tradePrice);
    pop();
  };
  const cancelOrder = () => {
    cancelTaskOrder(session.id, task.id);
    pop();
  };
  const unfill = () => {
    toggleTask(session.id, task.id);
    pop();
  };
  const fillOrderDrafts = () => {
    setQuantityDraft(draftOf(task.orderedQuantity));
    setPriceDraft(draftOf(task.orderedPrice));
  };
  const startAmend = () => {
    fillOrderDrafts();
    setAmending(true);
  };
  const stopAmend = () => {
    fillOrderDrafts();
    setAmending(false);
  };
  const saveAmend = () => {
    if (!canSave || tradePrice === null) return;
    orderTaskWith(session.id, task.id, quantity, tradePrice);
    pop();
  };
  const isOrderInput = status === "pending" || amending;

  return (
    <div className="flex flex-col gap-x6 px-x4 pt-x4 pb-x6">
      <p className="t4-regular text-fg-neutral-muted tabular-nums">{headline(task)}</p>

      {status === "ordered" && !amending && <OrderCard task={task} onAmend={startAmend} />}

      <StepperField
        label={isOrderInput ? `${task.action} 주문 수량` : `${task.action} 체결 수량`}
        value={quantityDraft}
        onValueChange={(value) => setQuantityDraft(formatMoneyDraft(value))}
        suffix="주"
        canStep={quantityOk}
        // 1주씩 움직이고 1주 아래로는 내려가지 않는다.
        onStep={(direction) =>
          setQuantityDraft(formatWithCommas(Math.max(1, quantity + direction)))
        }
        stepLabel="1주"
        autoFocus
        hint={
          task.quantity === null ? null : differs ? (
            // 권장 수량은 시작할 때 계산한 계획이라, 다르게 사고팔면 그 차이는 다른 매매에 반영되지 않는다.
            <span className="text-fg-warning">
              권장 {formatWithCommas(task.quantity)}주와 달라요 · 주문가능금액이 남거나 모자랄 수
              있어요
            </span>
          ) : (
            `권장 ${formatWithCommas(task.quantity)}주`
          )
        }
      />

      <StepperField
        label={isOrderInput ? "주문 가격 (주당)" : "체결 가격 (주당)"}
        value={priceDraft}
        onValueChange={(value) => setPriceDraft(formatMoneyDraft(value))}
        suffix="원"
        canStep={priceOk}
        onStep={(direction) => setPrice(stepByTick(price, direction, securityType))}
        stepLabel="한 호가"
        // 직접 입력한 값은 입력을 마치면 가장 가까운 호가로 맞춘다.
        onBlur={() => priceOk && setPrice(snapToTick(price, securityType))}
        hint={priceHint(task, tick, priceOk ? price : null, isOrderInput)}
      />

      <dl className="bg-bg-neutral-weak rounded-r3 flex flex-col gap-y-x2 px-x4 py-x3">
        <SummaryRow label={`${task.action} 금액`}>
          {amount !== null ? `${formatWithCommas(amount)}원` : "-"}
        </SummaryRow>
        {sellTax !== null && amount !== null && sellTax.total > 0 && (
          <SellTaxRows amount={amount} tax={sellTax} />
        )}
        {cash && (
          <SummaryRow label="주문가능금액">
            <span className="text-fg-neutral-muted font-normal">
              {formatWithCommas(cash.before)}원 →{" "}
            </span>
            <span className={cn(shortOfCash && "text-fg-critical")}>
              {formatSignedWon(cash.after)}
            </span>
          </SummaryRow>
        )}
      </dl>

      <div className="flex gap-x2">
        {status === "pending" && (
          // 시장가처럼 주문하자마자 체결됐으면 주문 기록을 건너뛴다.
          <ActionButton variant="neutralWeak" size="large" disabled={!canSave} onClick={recordFill}>
            바로 체결
          </ActionButton>
        )}
        {status === "ordered" && !amending && (
          <ActionButton variant="neutralWeak" size="large" onClick={cancelOrder}>
            주문 취소
          </ActionButton>
        )}
        {amending && (
          <ActionButton variant="neutralWeak" size="large" onClick={stopAmend}>
            정정 취소
          </ActionButton>
        )}
        {status === "filled" && (
          <ActionButton variant="neutralWeak" size="large" onClick={unfill}>
            체결 취소
          </ActionButton>
        )}
        <ActionButton
          size="large"
          flexGrow
          disabled={!canSave}
          onClick={amending ? saveAmend : status === "pending" ? recordOrder : recordFill}
        >
          {amending ? "정정 저장" : PRIMARY_LABEL[status]}
        </ActionButton>
      </div>
    </div>
  );
}

/**
 * 증권사에 넣어 둔 주문: "주문 32주 · 주당 11,800원 / 총 377,600원" 과 [정정].
 * 아래 입력 칸은 체결 값이라, 주문 값은 여기서 따로 보여 정정할 수 있게 한다.
 */
function OrderCard({ task, onAmend }: { task: RebalancingTask; onAmend: () => void }) {
  const quantity = task.orderedQuantity ?? 0;
  const price = task.orderedPrice ?? 0;
  return (
    <div className="border-stroke-neutral-muted rounded-r3 flex items-center gap-x3 border px-x4 py-x3">
      <div className="min-w-0 flex-1">
        <p className="t4-medium tabular-nums">
          {task.action} 주문 {formatWithCommas(quantity)}주 · 주당 {formatWithCommas(price)}원
        </p>
        <p className="t3-regular text-fg-neutral-muted mt-[2px] tabular-nums">
          총 {formatWithCommas(Math.round(quantity * price))}원
        </p>
      </div>
      <ActionButton variant="neutralWeak" size="small" onClick={onAmend}>
        정정
      </ActionButton>
    </div>
  );
}

/** 라벨 + [− 입력 +] + 안내 한 줄. 수량(1주씩)과 체결 가격(한 호가씩)이 같은 모양을 쓴다. */
function StepperField({
  label,
  value,
  onValueChange,
  suffix,
  canStep,
  onStep,
  stepLabel,
  onBlur,
  autoFocus,
  hint,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  suffix: string;
  /** 지금 값이 유효해 −/+ 로 움직일 수 있는가. */
  canStep: boolean;
  onStep: (direction: 1 | -1) => void;
  /** 버튼 접근성 이름에 쓰는 한 번에 움직이는 양 ("1주", "한 호가"). */
  stepLabel: string;
  onBlur?: () => void;
  autoFocus?: boolean;
  hint: ReactNode;
}) {
  return (
    <div>
      <p className="t4-medium mb-x2">{label}</p>
      <div className="flex items-center gap-x2">
        <ActionButton
          variant="neutralWeak"
          size="large"
          layout="iconOnly"
          aria-label={`${stepLabel} 내리기`}
          disabled={!canStep}
          onClick={() => onStep(-1)}
        >
          <Icon svg={<IconMinusLine />} />
        </ActionButton>
        <div className="min-w-0 flex-1">
          <TextField
            value={value}
            onValueChange={({ value: next }) => onValueChange(next)}
            suffix={suffix}
          >
            <TextFieldInput
              aria-label={label}
              inputMode="numeric"
              placeholder="0"
              autoFocus={autoFocus}
              onBlur={onBlur}
            />
          </TextField>
        </div>
        <ActionButton
          variant="neutralWeak"
          size="large"
          layout="iconOnly"
          aria-label={`${stepLabel} 올리기`}
          disabled={!canStep}
          onClick={() => onStep(1)}
        >
          <Icon svg={<IconPlusLine />} />
        </ActionButton>
      </div>
      {hint && <p className="t3-regular text-fg-neutral-subtle mt-x2 tabular-nums">{hint}</p>}
    </div>
  );
}

/** 매도 세금 — 증권거래세·농어촌특별세 (0% 인 줄은 뺀다) — 와 세금을 뺀 받는 돈. */
function SellTaxRows({ amount, tax }: { amount: number; tax: SellTax }) {
  return (
    <>
      {tax.transactionTaxPercent > 0 && (
        <CostRow
          label={`증권거래세 (${tax.transactionTaxPercent.toFixed(2)}%)`}
          won={tax.transactionTax}
        />
      )}
      {tax.ruralTaxPercent > 0 && (
        <CostRow label={`농어촌특별세 (${tax.ruralTaxPercent.toFixed(2)}%)`} won={tax.ruralTax} />
      )}
      <SummaryRow label="받는 돈 (세금 차감)">{formatWithCommas(amount - tax.total)}원</SummaryRow>
    </>
  );
}

function CostRow({ label, won }: { label: string; won: number }) {
  return (
    <SummaryRow label={label}>
      <span className="text-fg-neutral-muted font-normal">{formatWithCommas(won)}원</span>
    </SummaryRow>
  );
}

function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-x3">
      <dt className="t4-regular text-fg-neutral-muted shrink-0">{label}</dt>
      <dd className="t5-bold min-w-0 text-right tabular-nums">{children}</dd>
    </div>
  );
}

const PRIMARY_LABEL: Record<RebalancingTaskStatus, string> = {
  pending: "주문 기록",
  ordered: "체결 기록",
  filled: "저장",
};

const STATUS_SUFFIX: Record<RebalancingTaskStatus, string> = {
  pending: "",
  ordered: " 주문 중",
  filled: " 체결",
};

const isPositive = (value: number) => Number.isFinite(value) && value > 0;

const draftOf = (value: number | null | undefined) =>
  value !== null && value !== undefined && value > 0 ? formatWithCommas(value) : "";

/** 마이너스면 "−31,776원" (유니코드 마이너스). */
const formatSignedWon = (value: number) =>
  `${value < 0 ? "−" : ""}${formatWithCommas(Math.abs(Math.round(value)))}원`;

/** "매수 · 권장 40주 · 11,800원 기준" / 주문했으면 "매수 주문 중 · …", 체결했으면 "매수 체결 · …". */
function headline(task: RebalancingTask): string {
  const action = `${task.action}${STATUS_SUFFIX[rebalancingTaskStatus(task)]}`;
  if (task.quantity === null) return action;
  const basis = task.price !== null ? ` · ${formatWithCommas(task.price)}원 기준` : "";
  return `${action} · 권장 ${formatWithCommas(task.quantity)}주${basis}`;
}

/** 가격 칸 아래: "호가 5원 · 시작 시점 기준가 11,800원". 호가 단위를 모르면 그 부분은 뺀다. */
function priceHint(
  task: RebalancingTask,
  tick: number | null,
  price: number | null,
  isOrderInput: boolean
): string {
  if (price === null) {
    return isOrderInput ? "주문한 주당 가격을 입력하세요" : "체결된 주당 가격을 입력하세요";
  }
  const parts: string[] = [];
  if (tick !== null) parts.push(`호가 ${formatWithCommas(tick)}원`);
  if (task.price !== null) parts.push(`시작 시점 기준가 ${formatWithCommas(task.price)}원`);
  return parts.join(" · ");
}
