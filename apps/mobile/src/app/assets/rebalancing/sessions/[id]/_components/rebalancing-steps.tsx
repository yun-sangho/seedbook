"use client";

import type { ReactNode } from "react";
import { IconChevronLeftLine, IconChevronRightLine } from "@karrotmarket/react-monochrome-icon";
import { BottomAction } from "@mobile/components/mobile/bottom-action";
import type { RebalancingSession, RebalancingTask } from "@mobile/features/rebalancing/types/types";
import {
  type NextRebalancingAction,
  nextRebalancingAction,
} from "@mobile/features/rebalancing/utils/next-rebalancing-action";
import { summarizeRebalancingPriceAsOf } from "@mobile/features/rebalancing/utils/rebalancing-price-as-of";
import {
  executedQuantityOf,
  rebalancingTaskStatus,
  remainingOrderQuantity,
} from "@mobile/features/rebalancing/utils/rebalancing-session";
import { cn } from "@mobile/lib/utils";
import { ActionButton } from "@mobile/seed-design/ui/action-button";
import { formatWithCommas, numberToKorean } from "@mobile/utils/number-format";
import { Icon, SuffixIcon } from "@seed-design/react";
import { SnapshotPriceBanner } from "./snapshot-price-banner";
import { TradeEntryForm } from "./trade-entry-mobile";

/**
 * 진행 중인 리밸런싱을 매매 하나씩 단계로 푼다 (첫 가입 흐름처럼 위에 진행 칸, 가운데 한 가지 일).
 * 처음엔 추천 단계(`nextRebalancingAction`)를 열고, 기록하면 다음 추천 단계로 넘어간다. 순서는
 * 권장일 뿐이라 진행 칸이나 이전·다음으로 어느 매매든 열어 기록할 수 있다.
 *
 * `tasks` 는 목록과 같은 순서 (팔기 → 사기). `selectedId` 가 null 이면 추천 단계를 따른다.
 */
export function RebalancingSteps({
  session,
  tasks,
  available,
  selectedId,
  onSelect,
  footerTop,
  onShowList,
}: {
  session: RebalancingSession;
  tasks: RebalancingTask[];
  /** 지금 주문가능금액. 계좌를 몰라 계산할 수 없으면 null. */
  available: number | null;
  selectedId: string | null;
  onSelect: (taskId: string | null) => void;
  /** 내비게이션 위에 함께 고정할 버튼 (다 끝냈을 때 "리밸런싱 완료하기"). */
  footerTop?: ReactNode;
  /** 전체 목록으로. */
  onShowList: () => void;
}) {
  const recommended = nextRebalancingAction(tasks, available);
  const recommendedId = recommended.kind === "done" ? null : recommended.task.id;
  const current =
    tasks.find((t) => t.id === selectedId) ?? tasks.find((t) => t.id === recommendedId) ?? null;
  const index = current ? tasks.indexOf(current) : -1;

  // 가격 기준 시각 배너는 항상 맨 위 — 지금 단계의 매매 기준이다 (다 끝났으면 첫 매매).
  const bannerTask = current ?? tasks[0] ?? null;
  const priceAsOf = bannerTask ? summarizeRebalancingPriceAsOf([bannerTask]) : null;

  return (
    <div>
      {priceAsOf && <SnapshotPriceBanner summary={priceAsOf} live={current !== null} compact />}
      {/* 스텝 인디케이터 + 양 끝 아이콘 버튼으로 단계를 옮긴다 (SEED: 단계 흐름은 스텝 인디케이터·버튼 조합). */}
      <div className="flex items-center gap-x1 px-x2 pt-x1">
        <ActionButton
          variant="ghost"
          size="small"
          layout="iconOnly"
          aria-label="이전 거래"
          // 다 끝낸 화면에서는 마지막 거래로 돌아가 기록을 볼 수 있다.
          disabled={index === 0 || tasks.length === 0}
          onClick={() => onSelect(tasks[(index < 0 ? tasks.length : index) - 1]?.id ?? null)}
        >
          <Icon svg={<IconChevronLeftLine />} />
        </ActionButton>
        <StepProgress
          tasks={tasks}
          currentId={current?.id ?? null}
          onSelect={(id) => onSelect(id)}
        />
        <ActionButton
          variant="ghost"
          size="small"
          layout="iconOnly"
          aria-label="다음 거래"
          disabled={index < 0 || index >= tasks.length - 1}
          onClick={() => onSelect(tasks[index + 1]?.id ?? null)}
        >
          <Icon svg={<IconChevronRightLine />} />
        </ActionButton>
      </div>
      {/* 목록이 있다는 걸 알 수 있게 진행 칸 바로 아래에 — 지금 위치와 전체 보기. */}
      <div className="flex items-center justify-between px-x4">
        <span className="t3-regular text-fg-neutral-subtle tabular-nums">
          {current === null ? tasks.length : index + 1}/{tasks.length}
        </span>
        <ActionButton variant="ghost" size="small" bleedX="asPadding" onClick={onShowList}>
          전체 {tasks.length}건 보기
          <SuffixIcon svg={<IconChevronRightLine />} />
        </ActionButton>
      </div>
      {current === null ? (
        <section className="flex flex-col gap-x2 px-x4 py-x6">
          <p className="t9-bold">모든 거래를 마쳤어요</p>
          <p className="t4-regular text-fg-neutral-subtle">아래에서 리밸런싱을 마무리하세요.</p>
        </section>
      ) : (
        <CurrentStep
          key={current.id}
          session={session}
          task={current}
          // 추천 단계면 그 이유(판 돈으로 산다·돈이 모자라다)를, 아니면 이 매매의 금액만.
          action={current.id === recommendedId ? recommended : null}
          // 기록하면 다음 추천 단계로.
          onDone={() => onSelect(null)}
          footerTop={footerTop}
        />
      )}
      {/* 다 끝냈으면 완료 버튼만 하단에 고정한다. 단계가 열려 있으면 그 단계의 폼이 하단 바를 채운다. */}
      {current === null && footerTop && <BottomAction>{footerTop}</BottomAction>}
    </div>
  );
}

/**
 * 매매마다 한 칸 — 끝난 거래는 채우고, 주문한 거래는 옅게, 지금 단계는 두껍게. 누르면 그 단계로.
 */
function StepProgress({
  tasks,
  currentId,
  onSelect,
}: {
  tasks: RebalancingTask[];
  currentId: string | null;
  onSelect: (taskId: string) => void;
}) {
  const doneCount = tasks.filter((t) => t.done).length;
  return (
    <div
      role="progressbar"
      aria-label="거래 진행"
      aria-valuemin={0}
      aria-valuemax={tasks.length}
      aria-valuenow={doneCount}
      className="flex flex-1 items-center gap-x1"
    >
      {tasks.map((task, i) => {
        const status = rebalancingTaskStatus(task);
        const isCurrent = task.id === currentId;
        return (
          <button
            key={task.id}
            type="button"
            aria-label={`${i + 1}번째 거래 ${taskName(task)}`}
            aria-current={isCurrent ? "step" : undefined}
            onClick={() => onSelect(task.id)}
            // 누르기 쉽게 칸보다 넓은 영역을 준다.
            className="flex h-x6 flex-1 items-center"
          >
            <span
              className={cn(
                "block w-full rounded-full transition-[height]",
                isCurrent ? "h-[6px]" : "h-[3px]",
                status === "filled" && "bg-bg-brand-solid",
                status === "ordered" && "bg-bg-brand-solid opacity-40",
                status === "pending" &&
                  (isCurrent ? "bg-bg-neutral-weak-pressed" : "bg-bg-neutral-weak")
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

function CurrentStep({
  session,
  task,
  action,
  onDone,
  footerTop,
}: {
  session: RebalancingSession;
  task: RebalancingTask;
  action: NextRebalancingAction | null;
  onDone: () => void;
  footerTop?: ReactNode;
}) {
  const status = rebalancingTaskStatus(task);
  const copy = stepCopy(task, action);
  return (
    <>
      <section className="flex flex-col px-x4 pt-x2 pb-x3">
        <p className="t6-bold break-keep">{taskName(task)}</p>
        {/* 금액과 수량은 한 줄에 하나씩, 숫자(원·주)만 굵게 — "58,250원에 / 30주 사는 중". */}
        {copy.price && (
          <p className="t9-bold mt-x1 tabular-nums">
            {copy.price}
            <span className="font-normal">에</span>
          </p>
        )}
        <p className={cn("t9-bold tabular-nums", !copy.price && "mt-x1")}>
          {copy.quantity && <>{copy.quantity} </>}
          <span
            className={cn(
              "font-normal",
              status === "pending" && task.action === "매도" && "text-fg-critical",
              status === "pending" && task.action === "매수" && "text-fg-positive"
            )}
          >
            {copy.verb}
          </span>
        </p>
        {copy.note && (
          <p
            className={cn(
              "t4-regular mt-x2 tabular-nums",
              copy.critical ? "text-fg-critical" : "text-fg-neutral-subtle"
            )}
          >
            {copy.note}
          </p>
        )}
      </section>
      <div>
        <TradeEntryForm
          // 상태가 바뀌면 (주문 → 거래 끝) 입력을 새로 채운다.
          key={`${task.id}:${status}`}
          sessionId={session.id}
          task={task}
          embedded
          footerTop={footerTop}
          onDone={onDone}
        />
      </div>
    </>
  );
}

/** 원 금액을 만원 단위로 (1만원 미만이면 원 단위). */
const wonLabel = (won: number) => numberToKorean(won) || `${formatWithCommas(Math.round(won))}원`;

const taskName = (task: RebalancingTask) => task.name || task.ticker || "(미선택)";

/**
 * 단계의 큰 글씨 — 종목 수량과 쉬운 말 동사 ("111주 파세요"). 설명 문장은 두지 않고, 돈이 모자랄
 * 때만 경고 한 줄을 붙인다 (금액은 "금액 자세히" 에 있다).
 */
function stepCopy(
  task: RebalancingTask,
  action: NextRebalancingAction | null
): {
  price?: string | null;
  quantity: string | null;
  verb: string;
  note: string | null;
  critical?: boolean;
} {
  const sell = task.action === "매도";
  switch (rebalancingTaskStatus(task)) {
    case "filled": {
      const quantity = executedQuantityOf(task);
      return {
        quantity: quantity === null ? null : `${formatWithCommas(quantity)}주`,
        verb: sell ? "팔았어요" : "샀어요",
        note: null,
      };
    }
    case "ordered":
      // 주문한 가격과 남은 수량이 가장 중요하다 — "21,990원에 / 111주 파는 중".
      return {
        price: `${formatWithCommas(task.orderedPrice ?? 0)}원`,
        quantity: `${formatWithCommas(remainingOrderQuantity(task))}주`,
        verb: sell ? "파는 중" : "사는 중",
        note: null,
      };
    case "pending": {
      const quantity = task.quantity === null ? null : `${formatWithCommas(task.quantity)}주`;
      const shortfall = action?.kind === "buy" ? action.shortfall : 0;
      return {
        quantity,
        // 명령·권유로 읽히지 않게 계획 항목처럼 적는다 ("111주 팔기").
        verb: sell ? "팔기" : "사기",
        note: shortfall > 0 ? `쓸 수 있는 돈보다 ${wonLabel(shortfall)} 많아요` : null,
        critical: shortfall > 0,
      };
    }
  }
}
