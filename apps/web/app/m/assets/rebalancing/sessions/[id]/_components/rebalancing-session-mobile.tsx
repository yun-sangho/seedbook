"use client";

import { useState } from "react";
import { Divider } from "@seed-design/react";
import { useFlow } from "@stackflow/react";
import { ConfirmDialog } from "@web/components/mobile/confirm-dialog";
import { HeaderAction } from "@web/components/mobile/header-action";
import { PriceAsOfSummaryBanner, PriceBanner } from "@web/components/mobile/price-as-of-banner";
import { useRebalancingStore } from "@web/features/rebalancing/stores/rebalancing-store";
import type { RebalancingTask } from "@web/features/rebalancing/types/types";
import { formatRebalancingDate } from "@web/features/rebalancing/utils/format-rebalancing-date";
import { summarizeRebalancingPriceAsOf } from "@web/features/rebalancing/utils/rebalancing-price-as-of";
import {
  canCompleteRebalancing,
  isRebalancingCompleted,
  isRebalancingStopped,
  rebalancingProgress,
  visibleRebalancingTasks,
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

/**
 * 리밸런싱 할 일 목록. 종목별 매도/매수를 하나씩 체크하고, 모두 마치면 "리밸런싱 완료하기"로
 * 완료 기록을 남긴다 (원하면 계좌에도 반영).
 * 할 일은 시작 시점의 계산 결과 스냅샷이라 시세가 바뀌어도 그대로다.
 */
export function RebalancingSessionMobile({ id }: { id: string }) {
  const session = useRebalancingStore((s) => s.sessions.find((x) => x.id === id));
  const toggleTask = useRebalancingStore((s) => s.toggleTask);
  const removeRebalancing = useRebalancingStore((s) => s.removeRebalancing);
  const { pop } = useFlow();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [completing, setCompleting] = useState(false);

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
  const tasks = visibleRebalancingTasks(session, showAllTasks);
  const { done, total } = rebalancingProgress(session);
  const remaining = total - done;
  const canComplete = canCompleteRebalancing(session);
  const stopped = isRebalancingStopped(session);
  const endLabel = stopped ? "중지" : "완료";

  return (
    <div className="pb-x4">
      {/* 할 일은 시작 시점 시세 스냅샷 — 지금 시세가 아니라 그때 기준을 보여준다. */}
      {priceAsOf ? (
        <PriceAsOfSummaryBanner summary={priceAsOf} />
      ) : (
        // 가격 기준 시각을 저장하기 전에 시작한 리밸런싱 — 시작 시점으로 알린다.
        <PriceBanner title={`${formatRebalancingDate(session.startedAt)} 시작 시점 기준`} />
      )}
      <section className="px-x4 py-x4">
        <div className="flex items-center gap-x2">
          <Badge tone={stopped ? "warning" : completed ? "positive" : "informative"} variant="weak">
            {completed ? endLabel : "진행 중"}
          </Badge>
          <span className="t3-regular text-fg-neutral-subtle">
            {formatRebalancingDate(session.startedAt)} 시작
            {session.completedAt && ` · ${formatRebalancingDate(session.completedAt)} ${endLabel}`}
          </span>
        </div>
        <div className="mt-x4 grid grid-cols-2 gap-x-x4 gap-y-x3">
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
        <div className="flex items-center px-x4 pb-x2">
          <h2 className="t5-bold flex-1">
            남은 매매{" "}
            <span className="text-fg-neutral-subtle tabular-nums">
              {remaining} / {total}
            </span>
          </h2>
          {/* 완료된 리밸런싱은 원래 전부 보이므로 전환할 게 없다. */}
          {!completed && (
            <ActionButton
              variant="ghost"
              size="small"
              bleedX="asPadding"
              onClick={() => setShowAllTasks((v) => !v)}
            >
              {showAllTasks ? "남은 것만" : "전체 보기"}
            </ActionButton>
          )}
        </div>
        {tasks.length === 0 && (
          <p className="t4-regular text-fg-neutral-subtle px-x4 py-x6 text-center">
            모든 매매를 마쳤어요.
          </p>
        )}
        <List>
          {tasks.map((task) => (
            <ListCheckItem
              key={task.id}
              prefix={
                <Badge tone={task.action === "매수" ? "positive" : "critical"} variant="solid">
                  {task.action}
                </Badge>
              }
              title={
                <span className={cn(task.done && "text-fg-neutral-subtle line-through")}>
                  {task.name || task.ticker || "(미선택)"}
                </span>
              }
              detail={<TaskDetail task={task} />}
              suffix={<Checkmark tone="neutral" size="large" />}
              checked={task.done}
              onCheckedChange={() => toggleTask(session.id, task.id)}
              // 완료된 기록은 계좌에 반영됐을 수 있어 체크를 바꾸지 않는다.
              disabled={completed}
            />
          ))}
        </List>
      </section>

      {canComplete && (
        <div className="px-x4 pt-x2">
          <ActionButton size="large" className="w-full" onClick={() => setCompleting(true)}>
            {remaining > 0 ? "리밸런싱 중지하기" : "리밸런싱 완료하기"}
          </ActionButton>
        </div>
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

function TaskDetail({ task }: { task: RebalancingTask }) {
  return (
    <span className="tabular-nums">
      {formatWithCommas(task.amount)}원
      {task.quantity !== null && task.price !== null && (
        <>
          {" "}
          · 약 {formatWithCommas(task.quantity)}주 ({formatWithCommas(task.price)}원 기준)
        </>
      )}
    </span>
  );
}
