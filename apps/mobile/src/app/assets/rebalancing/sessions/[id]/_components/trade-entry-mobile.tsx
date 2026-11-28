"use client";

import { type ReactNode, useState } from "react";
import { IconMinusLine, IconPlusLine } from "@karrotmarket/react-monochrome-icon";
import { formatMoneyDraft } from "@mobile/components/mobile/input-format";
import { useInvestmentStore } from "@mobile/features/investments/stores/investment-store";
import { snapToTick, stepByTick, tickSize } from "@mobile/features/investments/utils/krx-tick-size";
import { RebalancingProgressBar } from "@mobile/features/rebalancing/components/rebalancing-progress-bar";
import { useRebalancingStore } from "@mobile/features/rebalancing/stores/rebalancing-store";
import type { RebalancingTask } from "@mobile/features/rebalancing/types/types";
import { affordableQuantity } from "@mobile/features/rebalancing/utils/affordable-quantity";
import { holdingQuantityFor } from "@mobile/features/rebalancing/utils/holding-quantity";
import { summarizeRebalancingPriceAsOf } from "@mobile/features/rebalancing/utils/rebalancing-price-as-of";
import {
  executedPriceOf,
  executedQuantityOf,
  filledQuantityOf,
  isRebalancingCompleted,
  type RebalancingTaskGroup,
  rebalancingTaskStatus,
  recordRebalancingFill,
  remainingOrderQuantity,
  remainingQuantityOf,
  targetQuantityOf,
} from "@mobile/features/rebalancing/utils/rebalancing-session";
import {
  buyShortfall,
  tradeCashPreviewFor,
} from "@mobile/features/rebalancing/utils/trade-cash-check";
import { useTaskSecurityTypes } from "@mobile/features/rebalancing/utils/use-task-security-types";
import { cn } from "@mobile/lib/utils";
import { ActionButton } from "@mobile/seed-design/ui/action-button";
import { Callout } from "@mobile/seed-design/ui/callout";
import { Checkbox } from "@mobile/seed-design/ui/checkbox";
import { ResultSection } from "@mobile/seed-design/ui/result-section";
import { TextField, TextFieldInput } from "@mobile/seed-design/ui/text-field";
import { formatWithCommas, parseNumericString } from "@mobile/utils/number-format";
import { Icon } from "@seed-design/react";
import { useFlow } from "@stackflow/react";
import { markJustMoved } from "./just-moved-tasks";
import { SnapshotPriceBanner } from "./snapshot-price-banner";

/**
 * 할 일 하나의 체결을 기록하는 화면. 주문은 기록하지 않는다 — 증권사 앱에서 실제로 거래된
 * 수량·가격만 적는다 (리밸런싱을 모르는 사람도 "판 만큼 적기" 하나만 하면 된다).
 *
 * - 처음엔 남은 수량과 시작 시점 가격(예전에 주문을 기록했으면 그 주문 수량·가격)으로 채운다.
 * - 한 번에 다 거래되지 않으면 거래된 만큼만 기록한다. 할 일은 "남은 n주" 로 열려 있다가 다시
 *   기록하고, 목표를 채우면 합친 수량·평균가로 끝난다 (`recordRebalancingFill`).
 * - "남은 n주는 안 팔래요(안 살래요)" 로 남은 수량을 거래하지 않고 할 일을 닫는다.
 * - 끝난 할 일은 "기록 고치기" 로 다시 연다 (마지막 기록 전 상태로 돌아간다).
 *
 * - 가격은 호가 단위(ETF 5원 등)에 맞춘다. −/+ 는 한 호가씩, 직접 입력은 입력을 마치면 가장 가까운
 *   호가로 맞춘다.
 * - 이 매수까지 반영한 쓸 수 있는 돈이 마이너스면 모자란 금액을 보여 주고, 사용자가 확인해야 기록한다.
 *   모자란 금액은 완료할 때 계좌 현금에 마이너스(미수)로 남는다.
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

/**
 * 할 일 하나의 체결 기록 폼. 매매 입력 화면과 진행 중 리밸런싱의 단계(`rebalancing-steps.tsx`)가
 * 함께 쓴다. `embedded` 면 단계 화면이 종목·목표를 이미 크게 보여 주므로 기준 시각 배너와 첫 줄을
 * 빼고, 단계를 옮길 때마다 키보드가 올라오지 않게 자동 포커스하지 않는다. 기록하면 `onDone`
 * (기본은 화면 닫기).
 */
export function TradeEntryForm({
  sessionId,
  task,
  embedded = false,
  onDone,
}: {
  sessionId: string;
  task: RebalancingTask;
  embedded?: boolean;
  onDone?: () => void;
}) {
  const session = useRebalancingStore((s) => s.sessions.find((x) => x.id === sessionId))!;
  const recordFill = useRebalancingStore((s) => s.recordFill);
  const closeTask = useRebalancingStore((s) => s.closeTask);
  const clearFills = useRebalancingStore((s) => s.clearFills);
  const toggleTask = useRebalancingStore((s) => s.toggleTask);
  const priceAsOf = summarizeRebalancingPriceAsOf([task]);
  const account = useInvestmentStore((s) =>
    s.investments.find((inv) => inv.id === session.accountId)
  );
  const { pop } = useFlow();
  const done = onDone ?? (() => pop());
  const sell = task.action === "매도";
  const verb = sell ? "판" : "산";

  const filled = filledQuantityOf(task);
  const target = targetQuantityOf(task);
  const remaining = remainingQuantityOf(task);
  // 남은 수량과 시작 시점 가격으로 채운다. 예전에 주문을 기록했으면 그 주문의 남은 수량·가격으로.
  const [quantityDraft, setQuantityDraft] = useState(() =>
    draftOf(task.orderedQuantity != null ? remainingOrderQuantity(task) || remaining : remaining)
  );
  const [priceDraft, setPriceDraft] = useState(() => draftOf(task.orderedPrice ?? task.price));
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
  // 계좌가 지워졌으면 예수금을 알 수 없어 확인하지 않는다.
  const cash =
    account && !task.done && quantityOk && tradePrice !== null
      ? tradeCashPreviewFor(
          account,
          session,
          task.id,
          recordRebalancingFill(session, task.id, quantity, tradePrice)
        )
      : null;
  const shortfall = cash !== null ? buyShortfall(task.action, cash) : 0;
  const shortOfCash = shortfall > 0;
  // 확인한 모자란 금액 — 수량·가격이 바뀌어 금액이 달라지면 확인이 풀린다.
  const [confirmedShortfall, setConfirmedShortfall] = useState<number | null>(null);
  const shortfallConfirmed = shortOfCash && confirmedShortfall === shortfall;
  const canSave = quantityOk && tradePrice !== null && (!shortOfCash || shortfallConfirmed);
  // 매수가 모자랄 때 지금 살 수 있는 최대 수량.
  const affordable =
    cash !== null && shortOfCash && tradePrice !== null
      ? affordableQuantity(cash.before, tradePrice)
      : 0;
  const held = account ? holdingQuantityFor(account.holdings ?? [], task) : null;
  const oversold = sell && held !== null && quantityOk && filled + quantity > held;
  const setPrice = (next: number) => setPriceDraft(formatWithCommas(next));
  // 목록의 "끝난 거래" 로 옮겨지는 애니메이션 — 이번 기록으로 할 일이 끝날 때만.
  const fromGroup: RebalancingTaskGroup =
    rebalancingTaskStatus(task) === "ordered" ? "ordered" : "pending";

  const record = () => {
    if (!canSave || tradePrice === null) return;
    if (remaining === null || quantity >= remaining) markJustMoved(task.id, fromGroup);
    recordFill(session.id, task.id, quantity, tradePrice);
    done();
  };
  const close = () => {
    markJustMoved(task.id, fromGroup);
    closeTask(session.id, task.id);
    done();
  };

  if (task.done) {
    const executed = executedQuantityOf(task) ?? 0;
    const executedPrice = executedPriceOf(task);
    return (
      <div className={cn("flex flex-col px-x4", embedded ? "gap-x3 pb-x1" : "gap-x6 pt-x4 pb-x6")}>
        {!embedded && (
          <p className="t4-regular text-fg-neutral-muted tabular-nums">{headline(task)}</p>
        )}
        {executed > 0 && executedPrice !== null && (
          <dl className="bg-bg-neutral-weak rounded-r3 flex flex-col gap-y-x2 px-x4 py-x3">
            <SummaryRow label={`${verb} 수량`}>{formatWithCommas(executed)}주</SummaryRow>
            <SummaryRow label="평균 가격">
              {formatWithCommas(Math.round(executedPrice))}원
            </SummaryRow>
            <SummaryRow label={`${verb} 금액`}>
              {formatWithCommas(Math.round(executed * executedPrice))}원
            </SummaryRow>
          </dl>
        )}
        <ActionButton
          variant="neutralWeak"
          size="large"
          onClick={() => {
            toggleTask(session.id, task.id);
            done();
          }}
        >
          기록 고치기
        </ActionButton>
      </div>
    );
  }

  return (
    <>
      {/* 거래할 때 보는 가격이 시작 시점 기준이라는 것과, 오래됐으면 그 경고. */}
      {!embedded && priceAsOf && <SnapshotPriceBanner summary={priceAsOf} live />}
      <div className={cn("flex flex-col px-x4", embedded ? "gap-x3 pb-x1" : "gap-x6 pt-x4 pb-x6")}>
        {!embedded && (
          <p className="t4-regular text-fg-neutral-muted tabular-nums">{headline(task)}</p>
        )}

        {/* 일부만 거래됐으면 목표까지 얼마나 했는지 — "판 수량 ▬▬▬── 60/111". */}
        {filled > 0 && target !== null && (
          <div>
            <p className="t4-medium">지금까지 {verb} 수량</p>
            <RebalancingProgressBar done={filled} total={target} />
          </div>
        )}

        <StepperField
          label={`${verb} 수량`}
          value={quantityDraft}
          onValueChange={(value) => setQuantityDraft(formatMoneyDraft(value))}
          suffix="주"
          canStep={quantityOk}
          // 1주씩 움직이고 1주 아래로는 내려가지 않는다.
          onStep={(direction) =>
            setQuantityDraft(formatWithCommas(Math.max(1, quantity + direction)))
          }
          stepLabel="1주"
          autoFocus={!embedded}
          hint={null}
        />

        <StepperField
          label={`${verb} 가격 (1주)`}
          value={priceDraft}
          onValueChange={(value) => setPriceDraft(formatMoneyDraft(value))}
          suffix="원"
          canStep={priceOk}
          onStep={(direction) => setPrice(stepByTick(price, direction, securityType))}
          stepLabel="한 칸"
          // 직접 입력한 값은 입력을 마치면 가장 가까운 호가로 맞춘다.
          onBlur={() => priceOk && setPrice(snapToTick(price, securityType))}
          hint={embedded && priceOk ? null : priceHint(task, tick, priceOk ? price : null, verb)}
        />

        <dl className="bg-bg-neutral-weak rounded-r3 flex flex-col gap-y-x2 px-x4 py-x3">
          <SummaryRow label={`${verb} 금액`}>
            {amount !== null ? `${formatWithCommas(amount)}원` : "-"}
          </SummaryRow>
        </dl>

        {oversold && (
          <Callout
            tone="warning"
            description={`보유한 ${formatWithCommas(held)}주보다 많아요. 보유 수량까지만 계좌에 반영돼요.`}
          />
        )}
        {shortOfCash && (
          <div className="flex flex-col items-start gap-x3">
            <p className="t4-regular text-fg-critical tabular-nums">
              쓸 수 있는 돈이 {formatWithCommas(shortfall)}원 모자라요. 그대로 기록하면 리밸런싱을
              마칠 때 계좌 현금이 −{formatWithCommas(shortfall)}원으로 남아요.
            </p>
            <Checkbox
              label={`모자란 ${formatWithCommas(shortfall)}원은 현금 마이너스로 두고 기록할게요`}
              checked={shortfallConfirmed}
              onCheckedChange={(checked) => setConfirmedShortfall(checked ? shortfall : null)}
              tone="neutral"
            />
            {affordable > 0 && (
              <ActionButton
                variant="neutralWeak"
                size="small"
                onClick={() => setQuantityDraft(formatWithCommas(affordable))}
              >
                살 수 있는 {formatWithCommas(affordable)}주로 바꾸기
              </ActionButton>
            )}
          </div>
        )}

        <ActionButton size="large" variant="neutralSolid" disabled={!canSave} onClick={record}>
          기록하기
        </ActionButton>
        <div className="flex items-center justify-center gap-x2">
          <ActionButton variant="ghost" size="small" onClick={close}>
            {closeLabel(task.action, filled > 0 ? remaining : null)}
          </ActionButton>
          {filled > 0 && (
            <ActionButton
              variant="ghost"
              size="small"
              onClick={() => clearFills(session.id, task.id)}
            >
              기록 지우기
            </ActionButton>
          )}
        </div>
      </div>
    </>
  );
}

/** "남은 51주는 안 팔래요" — 거래한 것이 없으면 "이 종목은 안 팔래요". */
function closeLabel(action: RebalancingTask["action"], remaining: number | null): string {
  const no = action === "매도" ? "안 팔래요" : "안 살래요";
  return remaining === null ? `이 종목은 ${no}` : `남은 ${formatWithCommas(remaining)}주는 ${no}`;
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

function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-x3">
      <dt className="t4-regular text-fg-neutral-muted shrink-0">{label}</dt>
      <dd className="t5-bold min-w-0 text-right tabular-nums">{children}</dd>
    </div>
  );
}

const isPositive = (value: number) => Number.isFinite(value) && value > 0;

// 평균 체결가처럼 원 아래 자리가 있는 값은 원 단위로 채운다.
const draftOf = (value: number | null | undefined) =>
  value !== null && value !== undefined && value > 0 ? formatWithCommas(Math.round(value)) : "";

/** "팔기 · 목표 40주 · 11,800원 기준" — 거래 중이면 "남은 n주", 끝났으면 "끝남". */
function headline(task: RebalancingTask): string {
  const action = task.action === "매도" ? "팔기" : "사기";
  const target = targetQuantityOf(task);
  if (task.done) return `${action} 끝남`;
  if (target === null) return action;
  const remaining = remainingQuantityOf(task) ?? target;
  const left = remaining < target ? ` · 남은 ${formatWithCommas(remaining)}주` : "";
  const basis = task.price !== null ? ` · ${formatWithCommas(task.price)}원 기준` : "";
  return `${action} · 목표 ${formatWithCommas(target)}주${left}${basis}`;
}

/** 가격 칸 아래: "호가 5원 · 시작 시점 기준가 11,800원". 호가 단위를 모르면 그 부분은 뺀다. */
function priceHint(
  task: RebalancingTask,
  tick: number | null,
  price: number | null,
  verb: string
): string {
  if (price === null) return `${verb} 1주 가격을 입력하세요`;
  const parts: string[] = [];
  if (tick !== null) parts.push(`한 칸 ${formatWithCommas(tick)}원`);
  if (task.price !== null) parts.push(`시작할 때 가격 ${formatWithCommas(task.price)}원`);
  return parts.join(" · ");
}
