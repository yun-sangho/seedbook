"use client";

import { useEffect, useRef, useState } from "react";
import { Divider } from "@seed-design/react";
import { useFlow } from "@stackflow/react";
import { ConfirmDialog } from "@web/components/mobile/confirm-dialog";
import { HeaderAction } from "@web/components/mobile/header-action";
import { PriceAsOfSummaryBanner, PriceBanner } from "@web/components/mobile/price-as-of-banner";
import {
  describePriceAsOf,
  type PriceAsOfSummary,
} from "@web/features/investments/utils/price-as-of";
import { RebalancingProgressBar } from "@web/features/rebalancing/components/rebalancing-progress-bar";
import { useRebalancingStore } from "@web/features/rebalancing/stores/rebalancing-store";
import type { RebalancingTask } from "@web/features/rebalancing/types/types";
import { priceAgeWarning } from "@web/features/rebalancing/utils/price-age";
import { summarizeRebalancingPriceAsOf } from "@web/features/rebalancing/utils/rebalancing-price-as-of";
import {
  canCompleteRebalancing,
  executedQuantityOf,
  groupRebalancingTasks,
  isRebalancingCompleted,
  isRebalancingStopped,
  rebalancingProgress,
} from "@web/features/rebalancing/utils/rebalancing-session";
import { cn } from "@web/lib/utils";
import { ActionButton } from "@web/seed-design/ui/action-button";
import { Badge } from "@web/seed-design/ui/badge";
import { Callout } from "@web/seed-design/ui/callout";
import { Checkmark } from "@web/seed-design/ui/checkbox";
import { List, ListCheckItem } from "@web/seed-design/ui/list";
import { ResultSection } from "@web/seed-design/ui/result-section";
import { formatWithCommas, numberToKorean } from "@web/utils/number-format";
import { CompleteRebalancingSheet } from "./complete-rebalancing-sheet";
import { TradeQuantitySheet } from "./trade-quantity-sheet";

/** 체크된 할 일이 남은 목록에 머무는 시간. globals.css 의 task-leave (지연 500 + 300ms) 와 맞춘다. */
const TASK_LEAVE_MS = 800;

/**
 * 리밸런싱 할 일 체크리스트. 권장 수량은 시작할 때의 가격으로 고정된 스냅샷이라 시세가
 * 바뀌어도 그대로다. 종목별 매도/매수를 하나씩 체크하고, 모두 마치면 "리밸런싱 완료하기"로
 * 완료 기록을 남긴다 (원하면 계좌에도 반영).
 */
export function RebalancingSessionMobile({ id }: { id: string }) {
  const session = useRebalancingStore((s) => s.sessions.find((x) => x.id === id));
  const toggleTask = useRebalancingStore((s) => s.toggleTask);
  const completeTaskWith = useRebalancingStore((s) => s.completeTaskWith);
  const removeRebalancing = useRebalancingStore((s) => s.removeRebalancing);
  const { pop } = useFlow();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [completing, setCompleting] = useState(false);
  const { leavingIds, markLeaving, cancelLeaving } = useLeavingTasks();
  // 수량 시트로 여는 매매. 남은 매매면 완료 기록, 완료한 매매면 수량 수정/완료 취소.
  const [editingId, setEditingId] = useState<string | null>(null);
  // 완료를 취소한 매매의 직전 기록 수량 — 다시 완료할 때 미리 채워 실수로 풀어도 그대로 되돌린다.
  const [lastRecorded, setLastRecorded] = useState<ReadonlyMap<string, number>>(() => new Map());

  if (!session) {
    return (
      <div className="flex min-h-[60dvh] flex-col">
        <ResultSection
          title="리밸런싱을 찾을 수 없어요"
          description="삭제되었거나 잘못된 링크일 수 있습니다."
          primaryActionProps={{ children: "리밸런싱 목록으로", onClick: () => pop() }}
        />
      </div>
    );
  }

  const completed = isRebalancingCompleted(session);
  const totalSell = sumAmount(session.tasks, "매도");
  const totalBuy = sumAmount(session.tasks, "매수");
  const priceAsOf = summarizeRebalancingPriceAsOf(session.tasks);
  const groups = groupRebalancingTasks(session.tasks, leavingIds);
  const { done, total } = rebalancingProgress(session);
  const remaining = total - done;
  const canComplete = canCompleteRebalancing(session);
  const stopped = isRebalancingStopped(session);

  const editingTask = session.tasks.find((t) => t.id === editingId) ?? null;

  return (
    <div className="pb-x4">
      {/* 권장 수량을 계산한 시작 시점 시세의 기준 시각 — 지금 시세가 아니다. */}
      {priceAsOf ? (
        <SnapshotPriceBanner summary={priceAsOf} live={!completed} />
      ) : (
        <PriceBanner title="가격 기준 시각이 기록되지 않았어요" />
      )}
      <section className="px-x4 py-x4">
        {/* 현금 투입/인출이 있으면 한 줄에 셋을 나란히 둔다. */}
        <div
          className={cn(
            "grid gap-x-x4 gap-y-x3",
            session.cashDelta !== 0 ? "grid-cols-3" : "grid-cols-2"
          )}
        >
          <Stat label="총 매도" value={totalSell} className="text-fg-critical" />
          <Stat label="총 매수" value={totalBuy} className="text-fg-positive" />
          {session.cashDelta !== 0 && (
            <Stat
              label={session.cashDelta > 0 ? "현금 투입" : "현금 인출"}
              value={Math.abs(session.cashDelta)}
            />
          )}
        </div>
      </section>

      {completed && (
        <div className="px-x4 pb-x4">
          {stopped ? (
            <Callout
              tone="neutral"
              description={`매매 ${remaining}건을 하지 않고 중지했어요. 리밸런싱 기록에 남았습니다.`}
            />
          ) : (
            <Callout
              tone="positive"
              description="모든 매매를 마쳤어요. 리밸런싱 기록에 남았습니다."
            />
          )}
        </div>
      )}

      <Divider />

      <section className="py-x4">
        <h2 className="t5-bold px-x4">
          {stopped ? "하지 않은 매매" : "남은 매매"}{" "}
          <span className="text-fg-neutral-subtle tabular-nums">{remaining}건</span>
        </h2>
        {/* "남은 n건" 만으로는 전체 중 어디쯤인지 안 보여 진행 막대로 함께 보여준다. */}
        {!completed && (
          <div className="px-x4 pb-x2">
            <RebalancingProgressBar done={done} total={total} />
          </div>
        )}
        {groups.remaining.length === 0 && (
          <div className="flex flex-col items-center gap-x2 px-x4 py-x6">
            <p className="t4-regular text-fg-neutral-subtle">모든 매매를 마쳤어요.</p>
            {canComplete && (
              <ActionButton variant="ghost" size="small" onClick={() => setCompleting(true)}>
                리밸런싱 완료하기
              </ActionButton>
            )}
          </div>
        )}
        <List>
          {groups.remaining.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              // 방금 체크했으면 체크된 모습을 보여준 뒤 접히며 빠지고, 완료 그룹으로 옮겨진다.
              leaving={leavingIds.has(task.id)}
              disabled={completed}
              onToggle={() => setEditingId(task.id)}
            />
          ))}
        </List>

        {/* 끝낸 매매는 아래 완료 그룹에 쌓인다 — 하나씩 끝내 가는 진행이 눈에 보이게. */}
        {groups.done.length > 0 && (
          <>
            <h3 className="t4-bold text-fg-neutral-muted px-x4 pt-x4">
              완료 <span className="tabular-nums">{groups.done.length}건</span>
            </h3>
            <List>
              {groups.done.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  leaving={false}
                  disabled={completed}
                  onToggle={() => setEditingId(task.id)}
                />
              ))}
            </List>
          </>
        )}
      </section>

      {/* 모든 매매를 마쳤으면 위 "모든 매매를 마쳤어요" 아래의 완료 버튼을 쓴다. */}
      {canComplete && remaining > 0 && (
        <div className="px-x4 pt-x2">
          <ActionButton size="large" className="w-full" onClick={() => setCompleting(true)}>
            리밸런싱 중지하기
          </ActionButton>
        </div>
      )}
      {editingTask && (
        <TradeQuantitySheet
          key={`${editingTask.id}-${editingTask.done ? "edit" : "check"}`}
          task={editingTask}
          mode={editingTask.done ? "edit" : "check"}
          initialQuantity={
            editingTask.done
              ? executedQuantityOf(editingTask)
              : (lastRecorded.get(editingTask.id) ?? editingTask.quantity)
          }
          open
          onOpenChange={(open) => !open && setEditingId(null)}
          onConfirm={(quantity) => {
            if (!editingTask.done) markLeaving(editingTask.id);
            completeTaskWith(session.id, editingTask.id, quantity);
          }}
          onUncheck={() => {
            const recorded = executedQuantityOf(editingTask);
            if (recorded !== null) {
              setLastRecorded((prev) => new Map(prev).set(editingTask.id, recorded));
            }
            cancelLeaving(editingTask.id);
            toggleTask(session.id, editingTask.id);
          }}
        />
      )}
      <CompleteRebalancingSheet session={session} open={completing} onOpenChange={setCompleting} />

      <HeaderAction>
        <ActionButton
          variant="ghost"
          size="small"
          aria-label="리밸런싱 삭제"
          onClick={() => setConfirmingDelete(true)}
        >
          삭제
        </ActionButton>
      </HeaderAction>
      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title="이 리밸런싱을 삭제할까요?"
        description={
          completed ? "완료 기록에서 사라집니다." : "체크한 진행 상황이 함께 사라집니다."
        }
        onConfirm={() => {
          removeRebalancing(session.id);
          pop();
        }}
      />
    </div>
  );
}

/**
 * 권장 수량을 계산한 시작 시점 가격의 기준 시각. 진행 중인데 그 가격이 지금보다 5분 이상
 * 오래됐으면 경고로 알린다 (시세가 달라졌을 수 있다). 완료된 기록은 경고하지 않는다.
 */
function SnapshotPriceBanner({ summary, live }: { summary: PriceAsOfSummary; live: boolean }) {
  const now = new Date();
  const label = describePriceAsOf(summary, now);
  const warning = live ? priceAgeWarning(summary.asOf, now) : null;
  if (!warning) return <PriceAsOfSummaryBanner summary={summary} />;
  return <PriceBanner title={label.title} description={warning} tone="warning" />;
}

/** 할 일 한 줄. 왼쪽 원형 체크, 가운데 종목·금액, 오른쪽 권장 방향과 수량. */
function TaskRow({
  task,
  leaving,
  disabled,
  onToggle,
}: {
  task: RebalancingTask;
  leaving: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <ListCheckItem
      // 끝낸 매매는 줄 전체를 흐리게 하고 종목명·수량에 취소선을 긋는다.
      className={cn(
        task.done && "opacity-50",
        leaving && "animate-task-leave overflow-hidden motion-reduce:animate-none"
      )}
      // 체크 표시를 왼쪽에 두어 "하나씩 체크해 나간다" 는 흐름이 먼저 읽히게 한다. seed Checkmark
      // 를 그대로 쓰되 모양만 원형으로 (라디오는 하나만 고를 수 있어 동작이 맞지 않다).
      prefix={<Checkmark tone="neutral" size="large" className="rounded-full!" />}
      title={
        <span className={cn(task.done && "line-through")}>
          {task.name || task.ticker || "(미선택)"}
        </span>
      }
      detail={<TaskDetail task={task} />}
      // 무엇을 몇 주 — 권장 방향 배지를 수량 바로 위에 붙이고 오른쪽 정렬해
      // 종목마다 수량이 같은 세로선에 놓이게 한다.
      suffix={
        <span className="flex flex-col items-end gap-[2px]">
          <Badge tone={task.action === "매수" ? "positive" : "critical"} variant="outline">
            {task.action} 권장
          </Badge>
          <TaskQuantity task={task} />
        </span>
      }
      checked={task.done}
      onCheckedChange={onToggle}
      // 완료된 기록은 계좌에 반영됐을 수 있어 체크를 바꾸지 않는다.
      disabled={disabled}
    />
  );
}

/**
 * 방금 체크한 할 일을 `TASK_LEAVE_MS` 동안 "사라지는 중" 으로 들고 있는다.
 * 그 사이 체크를 풀면 바로 목록에 그대로 남는다.
 */
function useLeavingTasks() {
  const [leavingIds, setLeavingIds] = useState<ReadonlySet<string>>(() => new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => clearTimeout(timer));
  }, []);

  const remove = (id: string) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setLeavingIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const markLeaving = (id: string) => {
    clearTimeout(timers.current.get(id));
    timers.current.set(
      id,
      setTimeout(() => remove(id), TASK_LEAVE_MS)
    );
    setLeavingIds((prev) => new Set(prev).add(id));
  };

  return { leavingIds, markLeaving, cancelLeaving: remove };
}

function sumAmount(tasks: RebalancingTask[], action: RebalancingTask["action"]): number {
  return tasks.filter((t) => t.action === action).reduce((acc, t) => acc + t.amount, 0);
}

function Stat({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div>
      <p className="t3-regular text-fg-neutral-muted">{label}</p>
      <p className={cn("t5-bold mt-[2px] tabular-nums", className)}>
        {numberToKorean(value) || "0원"}
      </p>
    </div>
  );
}

/**
 * 매매할 때 가장 먼저 봐야 하는 건 몇 주인지 — 행 오른쪽에 크게 보여준다.
 * 시세가 없어 수량을 모르면 대신 금액을 보여준다.
 */
function TaskQuantity({ task }: { task: RebalancingTask }) {
  // 완료한 매매는 실제로 사고판 수량을 보여준다.
  const quantity = task.done ? executedQuantityOf(task) : task.quantity;
  return (
    <span className={cn("t5-bold text-fg-neutral tabular-nums", task.done && "line-through")}>
      {quantity !== null ? `${formatWithCommas(quantity)}주` : `${formatWithCommas(task.amount)}원`}
    </span>
  );
}

function TaskDetail({ task }: { task: RebalancingTask }) {
  const executed = executedQuantityOf(task);
  // 완료한 매매는 실제 수량 × 기준 가격, 아니면 권장 금액.
  const amount = executed !== null && task.price !== null ? executed * task.price : task.amount;
  const differs = executed !== null && task.quantity !== null && executed !== task.quantity;
  return (
    <span className="tabular-nums">
      {formatWithCommas(amount)}원
      {task.price !== null && <> · {formatWithCommas(task.price)}원 기준</>}
      {differs && <> · 권장 {formatWithCommas(task.quantity ?? 0)}주</>}
    </span>
  );
}
