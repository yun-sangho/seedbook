"use client";

import { useEffect, useRef, useState } from "react";
import { IconChevronDownSmallLine } from "@karrotmarket/react-monochrome-icon";
import {
  type SortOptionList,
  SortSheet,
  sortOptionLabel,
} from "@mobile/app/assets/investments/_components/investment-sheets";
import { BottomAction } from "@mobile/components/mobile/bottom-action";
import { ConfirmDialog } from "@mobile/components/mobile/confirm-dialog";
import { HeaderAction } from "@mobile/components/mobile/header-action";
import { PriceBanner } from "@mobile/components/mobile/price-as-of-banner";
import { useInvestmentStore } from "@mobile/features/investments/stores/investment-store";
import { useRebalancingStore } from "@mobile/features/rebalancing/stores/rebalancing-store";
import type { RebalancingTask } from "@mobile/features/rebalancing/types/types";
import {
  type RebalancingTaskSection,
  toggleCollapsedSection,
} from "@mobile/features/rebalancing/utils/collapsed-sections";
import { groupTasksByStep } from "@mobile/features/rebalancing/utils/group-tasks-by-step";
import { holdingQuantityFor } from "@mobile/features/rebalancing/utils/holding-quantity";
import { summarizeRebalancingPriceAsOf } from "@mobile/features/rebalancing/utils/rebalancing-price-as-of";
import {
  canCompleteRebalancing,
  executedPriceOf,
  executedQuantityOf,
  filledQuantityOf,
  isPartiallyFilled,
  isRebalancingCompleted,
  isRebalancingStopped,
  type RebalancingTaskGroup,
  rebalancingProgress,
  rebalancingTaskStatus,
  remainingOrderQuantity,
} from "@mobile/features/rebalancing/utils/rebalancing-session";
import {
  type RebalancingTaskSort,
  sortRebalancingTasks,
} from "@mobile/features/rebalancing/utils/sort-rebalancing-tasks";
import {
  type RebalancingCashOutlook,
  rebalancingCashOutlook,
} from "@mobile/features/rebalancing/utils/trade-cash-check";
import { savePreferences } from "@mobile/lib/preferences";
import { usePreferencesStore } from "@mobile/lib/preferences-store";
import { cn } from "@mobile/lib/utils";
import { ActionButton } from "@mobile/seed-design/ui/action-button";
import { Badge } from "@mobile/seed-design/ui/badge";
import {
  BottomSheetBody,
  BottomSheetContent,
  BottomSheetRoot,
} from "@mobile/seed-design/ui/bottom-sheet";
import { Callout } from "@mobile/seed-design/ui/callout";
import { List, ListButtonItem, ListItem } from "@mobile/seed-design/ui/list";
import { ResultSection } from "@mobile/seed-design/ui/result-section";
import { formatSignedWon, formatWithCommas, numberToKorean } from "@mobile/utils/number-format";
import { Divider, Icon } from "@seed-design/react";
import { useFlow } from "@stackflow/react";
import { CompleteRebalancingSheet } from "./complete-rebalancing-sheet";
import { justMovedFrom, takeJustMoved } from "./just-moved-tasks";
import { RebalancingResultSection } from "./rebalancing-result-section";
import { RebalancingSteps } from "./rebalancing-steps";
import { SnapshotPriceBanner } from "./snapshot-price-banner";

/** 체크된 할 일이 남은 목록에 머무는 시간. globals.css 의 task-leave (지연 500 + 300ms) 와 맞춘다. */
const TASK_LEAVE_MS = 800;

/**
 * 리밸런싱 할 일 체크리스트. 권장 수량은 시작할 때의 가격으로 고정된 스냅샷이라 시세가
 * 바뀌어도 그대로다. 종목별 매도/매수를 하나씩 체크하고, 모두 마치면 하단에 고정된 "리밸런싱 완료하기"로
 * 완료 기록을 남긴다 (원하면 계좌에도 반영).
 */
export function RebalancingSessionMobile({ id }: { id: string }) {
  const session = useRebalancingStore((s) => s.sessions.find((x) => x.id === id));
  const removeRebalancing = useRebalancingStore((s) => s.removeRebalancing);
  const { pop } = useFlow();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);
  // 진행 중에는 매매를 하나씩 단계로 본다. "전체 보기" 로 팔기·사기 목록을 연다.
  const [view, setView] = useState<"steps" | "list">("steps");
  /** 고른 단계. null 이면 추천 단계를 따른다 (기록하면 다시 null 로 — 다음 추천 단계로 넘어간다). */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const leaving = useLeavingTasks(session?.tasks);
  const [sortOpen, setSortOpen] = useState(false);
  // 정렬은 개인 설정 — 계정에 저장되어 어느 기기에서든 이어진다.
  const sort = usePreferencesStore((s) => s.rebalancingTaskSort);
  const setSort = (next: RebalancingTaskSort) =>
    void savePreferences({ rebalancingTaskSort: next });
  // 섹션 접힘도 개인 설정 — 정렬처럼 계정에 저장한다.
  const collapsedSections = usePreferencesStore((s) => s.rebalancingCollapsedSections);
  const toggleSection = (section: RebalancingTaskSection) => {
    void savePreferences({
      rebalancingCollapsedSections: toggleCollapsedSection(collapsedSections, section),
    });
  };
  const account = useInvestmentStore((s) =>
    s.investments.find((inv) => inv.id === session?.accountId)
  );
  // 목록에서 매매를 누르면 그 매매의 단계를 연다.
  const openTrade = (taskId: string) => {
    setSelectedId(taskId);
    setView("steps");
    topRef.current?.scrollIntoView();
  };

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
  // 진행 중일 때만 — 완료한 기록은 아래 결과에 반영 전 → 후 예수금이 나온다. 계좌가 지워졌으면 모른다.
  const cash = !completed && account ? rebalancingCashOutlook(account, session) : null;
  const priceAsOf = summarizeRebalancingPriceAsOf(session.tasks);
  // 방금 거래가 끝난 매매만 접히며 "끝난 거래" 로 옮겨진다 — 주문만 한 매매는 같은 묶음에 남는다.
  const leavingToDone = new Set(
    session.tasks.filter((t) => t.done && leaving.has(t.id)).map((t) => t.id)
  );
  const steps = groupTasksByStep(session.tasks, leavingToDone);
  // 평가액 = 지금 보유 수량 × 시작 시점 기준 가격 (가격이 고정된 체크리스트라 같은 기준을 쓴다).
  const holdingQuantity = (task: RebalancingTask) =>
    holdingQuantityFor(account?.holdings ?? [], task);
  const stepTasks = {
    sell: sortRebalancingTasks(steps.sell, sort, holdingQuantity),
    buy: sortRebalancingTasks(steps.buy, sort, holdingQuantity),
    done: sortRebalancingTasks(steps.done, sort, holdingQuantity),
  };
  const doneCollapsed = collapsedSections.includes("filled");
  // 팔 것과 살 것이 다 남았을 때만 1. 2. 로 순서를 붙인다.
  const bothSteps = !completed && stepTasks.sell.length > 0 && stepTasks.buy.length > 0;
  const { done, total } = rebalancingProgress(session);
  const remaining = total - done;
  const canComplete = canCompleteRebalancing(session);
  const readyToComplete = canComplete && remaining === 0;
  const stopped = isRebalancingStopped(session);

  return (
    <div ref={topRef} className="pb-x4">
      {/* 진행 중에는 매매 하나씩 — 추천 단계부터 열고, 기록하면 다음 추천 단계로 넘어간다. */}
      {!completed && view === "steps" && (
        <RebalancingSteps
          session={session}
          // 목록과 같은 순서 (팔기 → 사기). 거래가 끝나도 자리는 그대로다.
          tasks={sortRebalancingTasks(session.tasks, sort, holdingQuantity)}
          available={cash?.now ?? null}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onShowCash={cash ? () => setCashOpen(true) : null}
          onShowList={() => {
            setView("list");
            topRef.current?.scrollIntoView();
          }}
        />
      )}
      {completed &&
        // 권장 수량을 계산한 시작 시점 시세의 기준 시각 — 지금 시세가 아니다.
        (priceAsOf ? (
          <SnapshotPriceBanner summary={priceAsOf} live={false} />
        ) : (
          <PriceBanner title="가격 기준 시각이 기록되지 않았어요" />
        ))}

      {completed && (
        <div className="px-x4 py-x4">
          {stopped ? (
            <Callout
              tone="neutral"
              description={`매매 ${remaining}건을 하지 않고 종료했어요. 리밸런싱 기록에 남았습니다.`}
            />
          ) : (
            <Callout
              tone="positive"
              description="모든 매매를 마쳤어요. 리밸런싱 기록에 남았습니다."
            />
          )}
        </div>
      )}
      {/* 계좌에 반영하며 완료했으면 반영 후 구성을 보여준다. */}
      {completed && session.result && (
        <RebalancingResultSection result={session.result} tasks={session.tasks} />
      )}

      {(completed || view === "list") && (
        <>
          <Divider />

          <section className="py-x4">
            <div className="flex items-center px-x4">
              <h2 className="t5-bold flex-1">
                {completed ? "거래 내역" : "거래할 종목"}{" "}
                <span className="text-fg-neutral-subtle tabular-nums">{total}건</span>
              </h2>
              {/* 어떤 정렬이든 파는 종목이 사는 종목보다 먼저 나온다. */}
              <ActionButton
                variant="ghost"
                size="small"
                bleedX="asPadding"
                onClick={() => setSortOpen(true)}
              >
                {sortOptionLabel(TASK_SORT_OPTIONS, sort)}
                <Icon svg={<IconChevronDownSmallLine />} />
              </ActionButton>
            </div>
            {/* 팔 것과 살 것이 다 있을 때만 순서를 안내한다. */}
            {bothSteps && (
              <p className="t3-regular text-fg-neutral-subtle px-x4 pt-x1">
                판 돈으로 사니까 팔기부터 하면 쉬워요. 꼭 이 순서가 아니어도 돼요.
              </p>
            )}

            {/* 하는 순서대로 1. 팔기 → 2. 사기. 빈 묶음은 숨긴다. 어느 종목이든 눌러서 기록할 수 있다. */}
            {STEP_SECTIONS.map(({ key, title, endedTitle }) => {
              if (stepTasks[key].length === 0) return null;
              return (
                <div key={key} className="pt-x2">
                  <h3 className="t4-bold px-x4 py-x2">
                    {completed || !bothSteps ? endedTitle : title}{" "}
                    <span className="text-fg-neutral-subtle tabular-nums">
                      {stepTasks[key].length}건
                    </span>
                  </h3>
                  <TaskList
                    tasks={stepTasks[key]}
                    leaving={leavingToDone}
                    ended={completed}
                    showAction={false}
                    onOpen={openTrade}
                  />
                </div>
              );
            })}

            {stepTasks.done.length > 0 && (
              <div className="pt-x2">
                <button
                  type="button"
                  className="flex w-full items-center gap-x1 px-x4 py-x2 text-left"
                  aria-expanded={!doneCollapsed}
                  onClick={() => toggleSection("filled")}
                >
                  <h3 className="t4-bold flex-1">
                    끝난 거래{" "}
                    <span className="text-fg-neutral-subtle tabular-nums">
                      {stepTasks.done.length}건
                    </span>
                  </h3>
                  {/* 펼침 ⌄, 접힘 › */}
                  <span
                    className={cn(
                      "text-fg-neutral-subtle flex transition-transform motion-reduce:transition-none",
                      doneCollapsed && "-rotate-90"
                    )}
                  >
                    <Icon svg={<IconChevronDownSmallLine />} />
                  </span>
                </button>
                {!doneCollapsed && (
                  <TaskList
                    tasks={stepTasks.done}
                    leaving={leavingToDone}
                    ended={completed}
                    showAction
                    onOpen={openTrade}
                  />
                )}
              </div>
            )}
          </section>
        </>
      )}

      {/* 다 끝냈으면 완료가 주된 다음 행동 — 하단에 고정한다. 남았으면 종료는 보조 행동이다. */}
      {readyToComplete && (
        <BottomAction>
          <ActionButton size="large" className="w-full" onClick={() => setCompleting(true)}>
            리밸런싱 완료하기
          </ActionButton>
        </BottomAction>
      )}
      {canComplete && remaining > 0 && view === "list" && (
        <div className="px-x4 pt-x2">
          <ActionButton
            variant="neutralWeak"
            size="large"
            className="w-full"
            onClick={() => setCompleting(true)}
          >
            남은 {remaining}건은 하지 않고 끝내기
          </ActionButton>
        </div>
      )}
      <SortSheet
        open={sortOpen}
        onOpenChange={setSortOpen}
        title="매매 정렬"
        options={TASK_SORT_OPTIONS}
        value={sort}
        onChange={setSort}
      />
      {cash && (
        // 금액은 필요할 때 본다 — 지금 할 일 카드의 "금액 보기" 로 연다.
        <BottomSheetRoot open={cashOpen} onOpenChange={setCashOpen}>
          <BottomSheetContent title="금액" showHandle>
            <BottomSheetBody>
              <CashOutlook cash={cash} cashDelta={session.cashDelta} hasRemaining={remaining > 0} />
            </BottomSheetBody>
          </BottomSheetContent>
        </BottomSheetRoot>
      )}
      <CompleteRebalancingSheet
        session={session}
        open={completing}
        onOpenChange={setCompleting}
        // 완료 안내와 결과가 맨 위에 나온다.
        onCompleted={() => topRef.current?.scrollIntoView()}
      />

      <HeaderAction>
        {/* 목록에서 단계로 돌아가는 버튼. 단계 화면에서는 아래 "목록" 으로 연다. */}
        {!completed && view === "list" && (
          <ActionButton
            variant="ghost"
            size="small"
            onClick={() => {
              setView("steps");
              topRef.current?.scrollIntoView();
            }}
          >
            하나씩 보기
          </ActionButton>
        )}
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
          completed
            ? "완료 기록에서 사라집니다. 계좌에 반영한 내용은 그대로예요."
            : "기록한 주문과 체결이 함께 사라지고, 계좌에는 반영되지 않아요."
        }
        onConfirm={() => {
          removeRebalancing(session.id);
          pop();
        }}
      />
    </div>
  );
}

function TaskList({
  tasks,
  leaving,
  ended,
  showAction,
  onOpen,
}: {
  tasks: RebalancingTask[];
  leaving: ReadonlySet<string>;
  ended: boolean;
  /** 팔기·사기 묶음 안에서는 묶음 제목이 방향을 알려 줘 배지를 뺀다. */
  showAction: boolean;
  onOpen: (taskId: string) => void;
}) {
  return (
    <List>
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          // 방금 거래가 끝났으면 바뀐 모습을 보여준 뒤 접히며 빠지고, "끝난 거래" 로 옮겨진다.
          leaving={leaving.has(task.id)}
          ended={ended}
          showAction={showAction}
          onOpen={() => onOpen(task.id)}
        />
      ))}
    </List>
  );
}

/**
 * 할 일 한 줄. 왼쪽 상태 배지(주문한 뒤부터), 가운데 종목·총 금액, 오른쪽 수량·주당 가격.
 * 누르면 매매 입력 화면.
 */
function TaskRow({
  task,
  leaving,
  ended,
  showAction,
  onOpen,
}: {
  task: RebalancingTask;
  leaving: boolean;
  ended: boolean;
  showAction: boolean;
  onOpen: () => void;
}) {
  const content = {
    // 아직 손대지 않은 매매는 배지 없이 — 주문했거나 거래가 끝났을 때만 앞에 알린다.
    prefix: <TaskStatusBadge task={task} ended={ended} />,
    title: <span>{task.name || task.ticker || "(미선택)"}</span>,
    detail: <TaskDetail task={task} />,
    // 몇 주, 주당 얼마에 — 수량 아래 주당 가격을 두고 오른쪽 정렬해 같은 세로선에 놓이게 한다.
    suffix: (
      <span className="flex flex-col items-end gap-[2px]">
        <span className="flex items-center gap-x2 max-[359px]:flex-col max-[359px]:items-end max-[359px]:gap-[2px]">
          {showAction && (
            <Badge tone={task.action === "매수" ? "positive" : "critical"} variant="outline">
              {task.action === "매수" ? "사기" : "팔기"}
            </Badge>
          )}
          <TaskQuantity task={task} />
        </span>
        <TaskPrice task={task} />
      </span>
    ),
  };
  // 완료된 기록은 계좌에 반영됐을 수 있어 매매를 바꾸지 않는다 — 흐리게 하지 않고 읽기만 한다.
  if (ended) return <ListItem {...content} />;
  return (
    <ListButtonItem
      {...content}
      rootProps={{
        className: cn(leaving && "animate-task-leave overflow-hidden motion-reduce:animate-none"),
      }}
      onClick={onOpen}
    />
  );
}

/** 쉬운 말 상태. 진행 중에는 아직 손대지 않은 매매에 배지를 달지 않는다. */
const STATUS_BADGE: Record<
  RebalancingTaskSection,
  { label: string | null; tone: "neutral" | "informative" | "positive" }
> = {
  pending: { label: null, tone: "neutral" },
  ordered: { label: "주문함", tone: "informative" },
  filled: { label: "끝남", tone: "positive" },
};

/** 끝난 리밸런싱에서는 "주문함" 이 앞으로 할 일처럼 보이지 않게 부른다. */
const ENDED_LABEL: Record<RebalancingTaskSection, string> = {
  pending: "안 함",
  ordered: "거래 안 됨",
  filled: "끝남",
};

function TaskStatusBadge({ task, ended }: { task: RebalancingTask; ended: boolean }) {
  const status = rebalancingTaskStatus(task);
  const { label, tone } = STATUS_BADGE[status];
  // 일부만 거래된 주문은 배지로 구분한다 (끝난 기록에서도 일부는 거래됐다).
  if (isPartiallyFilled(task)) {
    return (
      <Badge tone={tone} variant="weak">
        일부 거래됨
      </Badge>
    );
  }
  const shown = ended ? ENDED_LABEL[status] : label;
  if (shown === null) return null;
  return (
    <Badge tone={tone} variant="weak">
      {shown}
    </Badge>
  );
}

const STEP_SECTIONS: { key: "sell" | "buy"; title: string; endedTitle: string }[] = [
  { key: "sell", title: "1. 팔기", endedTitle: "팔기" },
  { key: "buy", title: "2. 사기", endedTitle: "사기" },
];

const TASK_SORT_OPTIONS: SortOptionList<RebalancingTaskSort> = [
  { value: "nameDesc", label: "이름 내림차순" },
  { value: "nameAsc", label: "이름 오름차순" },
  { value: "evalDesc", label: "평가액 높은 순" },
  { value: "evalAsc", label: "평가액 낮은 순" },
];

/**
 * 방금 주문·체결한 할 일을 `TASK_LEAVE_MS` 동안 "사라지는 중" 으로 원래 그룹과 함께 들고 있는다 —
 * 바뀐 모습으로 원래 그룹에 남아 있다가 접히며 다음 그룹으로 옮겨진다. 기록은 매매 입력 화면에서
 * 하므로, 그 화면이 남긴 신호(`just-moved-tasks`)를 돌아왔을 때 꺼내 시작한다. 꺼내기 전 렌더에서도
 * 바로 옮기지 않도록 아직 꺼내지 않은 신호도 함께 본다.
 */
function useLeavingTasks(
  tasks: RebalancingTask[] | undefined
): ReadonlyMap<string, RebalancingTaskGroup> {
  const [leaving, setLeaving] = useState<ReadonlyMap<string, RebalancingTaskGroup>>(
    () => new Map()
  );
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => clearTimeout(timer));
  }, []);

  const remove = (id: string) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setLeaving((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  };

  const markLeaving = (id: string, from: RebalancingTaskGroup) => {
    clearTimeout(timers.current.get(id));
    timers.current.set(
      id,
      setTimeout(() => remove(id), TASK_LEAVE_MS)
    );
    setLeaving((prev) => new Map(prev).set(id, from));
  };

  // 매매 입력 화면에서 기록하고 돌아오면 (할 일이 바뀌면) 남긴 신호를 꺼내 애니메이션을 시작한다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: tasks 가 바뀔 때 다시 돈다. markLeaving 은 렌더마다 새로 만들어지지만 상태 setter 와 ref 만 쓴다.
  useEffect(() => {
    for (const [id, from] of takeJustMoved()) markLeaving(id, from);
  }, [tasks]);

  const notYetTaken = (tasks ?? []).flatMap((t) => {
    const from = justMovedFrom(t.id);
    return from ? [[t.id, from] as const] : [];
  });
  if (notYetTaken.length === 0) return leaving;
  return new Map([...leaving, ...notYetTaken]);
}

/**
 * 매매하면서 가장 자주 보는 건 남은 예수금 — 다음 매수를 할 수 있는지가 여기서 갈린다.
 * 지금 예수금(완료한 매매 반영)을 크게, 남은 매매를 권장대로 다 하면 남을 예수금을 함께 보여준다.
 */
function CashOutlook({
  cash,
  cashDelta,
  hasRemaining,
}: {
  cash: RebalancingCashOutlook;
  cashDelta: number;
  hasRemaining: boolean;
}) {
  const expected = (
    <>
      남은 매매 다 하면{" "}
      <span className={cn("t3-bold", cash.expected < 0 ? "text-fg-critical" : "text-fg-neutral")}>
        {formatSignedWon(cash.expected)}
      </span>
    </>
  );
  const held =
    cash.heldForOrders > 0
      ? `매수 주문 ${formatWithCommas(Math.round(cash.heldForOrders))}원 묶임`
      : null;
  const delta =
    cashDelta !== 0
      ? `${cashDelta > 0 ? "새로 넣은 돈" : "남겨 둔 돈"} ${numberToKorean(Math.abs(cashDelta))} ${cashDelta > 0 ? "포함" : "제외"}`
      : null;
  const notes = [held, delta].filter((note) => note !== null);
  return (
    <section className="pb-x4">
      <p className="t3-regular text-fg-neutral-muted">남은 주문가능금액</p>
      <p className={cn("t7-bold mt-[2px] tabular-nums", cash.now < 0 && "text-fg-critical")}>
        {formatSignedWon(cash.now)}
      </p>
      <p className="t3-regular text-fg-neutral-subtle mt-x1 tabular-nums">
        {hasRemaining && expected}
        {hasRemaining && notes.length > 0 && " · "}
        {notes.join(" · ")}
      </p>
      {hasRemaining && cash.expected < 0 && (
        <p className="t3-regular text-fg-critical mt-x1">
          이대로면 금액이 모자라요. 매수 수량을 줄여서 기록하세요.
        </p>
      )}
    </section>
  );
}

/**
 * 행에 보여줄 수량·주당 가격 — 상태마다 그때 정해진 값을 쓴다.
 * 대기: 권장 수량 · 시작 시점 가격 / 주문: 주문 수량 · 주문가 / 체결: 체결 수량 · 체결가.
 */
function shownTrade(task: RebalancingTask): { quantity: number | null; price: number | null } {
  switch (rebalancingTaskStatus(task)) {
    case "filled":
      return { quantity: executedQuantityOf(task), price: roundedPrice(executedPriceOf(task)) };
    case "ordered":
      return { quantity: task.orderedQuantity ?? null, price: task.orderedPrice ?? null };
    case "pending":
      return { quantity: task.quantity, price: task.price };
  }
}

/** 평균 체결가처럼 원 아래 자리가 있는 가격은 원 단위로 보여 준다. */
const roundedPrice = (price: number | null) => (price === null ? null : Math.round(price));

/** 매매할 때 먼저 보는 건 몇 주인지 — 행 오른쪽에 크게. 수량을 모르면 비워 둔다. */
function TaskQuantity({ task }: { task: RebalancingTask }) {
  const { quantity } = shownTrade(task);
  if (quantity === null) return null;
  return (
    <span className="t5-bold text-fg-neutral tabular-nums">{formatWithCommas(quantity)}주</span>
  );
}

/**
 * 주문 넣을 때 그대로 입력하는 주당 가격 — 수량 바로 아래에 같은 오른쪽 선으로 크게 둔다
 * (대기: 시작 시점 기준가 / 주문: 주문가 / 체결: 체결가). 시세를 몰랐으면 대신 권장 금액.
 */
function TaskPrice({ task }: { task: RebalancingTask }) {
  const { price } = shownTrade(task);
  return (
    <span className="t4-bold text-fg-neutral tabular-nums">
      {price !== null ? `주당 ${formatWithCommas(price)}원` : `${formatWithCommas(task.amount)}원`}
    </span>
  );
}

/**
 * 총 금액 (수량 × 주당 가격, 남은 예수금 계산과 같은 값) 과, 권장과 다른 수량으로 주문·체결했으면
 * 권장 수량. 시세를 몰라 총 금액이 오른쪽에 나온 행은 비운다.
 */
function TaskDetail({ task }: { task: RebalancingTask }) {
  const { quantity, price } = shownTrade(task);
  if (isPartiallyFilled(task)) {
    // 부분 체결: 주문 수량 중 몇 주가 체결됐고 몇 주가 남았는지.
    return (
      <span className="tabular-nums">
        {formatWithCommas(filledQuantityOf(task))}주 거래됨 · 남은{" "}
        {formatWithCommas(remainingOrderQuantity(task))}주
      </span>
    );
  }
  const differs = !!quantity && task.quantity !== null && quantity !== task.quantity;
  const total = quantity !== null && price !== null ? Math.round(quantity * price) : null;
  if (total === null && !differs) return null;
  return (
    <span className="tabular-nums">
      {total !== null && <>총 {formatWithCommas(total)}원</>}
      {total !== null && differs && " · "}
      {differs && <>추천 {formatWithCommas(task.quantity ?? 0)}주</>}
    </span>
  );
}
