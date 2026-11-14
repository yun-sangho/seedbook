"use client";

import { useEffect, useRef, useState } from "react";
import { IconChevronDownSmallLine } from "@karrotmarket/react-monochrome-icon";
import { Divider, Icon } from "@seed-design/react";
import { useFlow } from "@stackflow/react";
import {
  type SortOptionList,
  SortSheet,
  sortOptionLabel,
} from "@web/app/m/assets/investments/_components/investment-sheets";
import { ConfirmDialog } from "@web/components/mobile/confirm-dialog";
import { HeaderAction } from "@web/components/mobile/header-action";
import { PriceAsOfSummaryBanner, PriceBanner } from "@web/components/mobile/price-as-of-banner";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import {
  describePriceAsOf,
  type PriceAsOfSummary,
} from "@web/features/investments/utils/price-as-of";
import { stockPriceKey } from "@web/features/investments/utils/use-stock-prices";
import { useRebalancingStore } from "@web/features/rebalancing/stores/rebalancing-store";
import type { RebalancingTask } from "@web/features/rebalancing/types/types";
import {
  type RebalancingTaskSection,
  toggleCollapsedSection,
} from "@web/features/rebalancing/utils/collapsed-sections";
import { priceAgeWarning } from "@web/features/rebalancing/utils/price-age";
import { summarizeRebalancingPriceAsOf } from "@web/features/rebalancing/utils/rebalancing-price-as-of";
import {
  canCompleteRebalancing,
  executedPriceOf,
  executedQuantityOf,
  groupRebalancingTasks,
  isRebalancingCompleted,
  isRebalancingStopped,
  type RebalancingTaskGroup,
  rebalancingProgress,
  rebalancingTaskStatus,
} from "@web/features/rebalancing/utils/rebalancing-session";
import {
  type RebalancingTaskSort,
  sortRebalancingTasks,
} from "@web/features/rebalancing/utils/sort-rebalancing-tasks";
import {
  type RebalancingCashOutlook,
  rebalancingCashOutlook,
} from "@web/features/rebalancing/utils/trade-cash-check";
import { pushRebalancingCollapsedSections, pushRebalancingTaskSort } from "@web/lib/preferences";
import { usePreferencesStore } from "@web/lib/preferences-store";
import { cn } from "@web/lib/utils";
import { ActionButton } from "@web/seed-design/ui/action-button";
import { Badge } from "@web/seed-design/ui/badge";
import { Callout } from "@web/seed-design/ui/callout";
import { List, ListButtonItem } from "@web/seed-design/ui/list";
import { ResultSection } from "@web/seed-design/ui/result-section";
import { formatWithCommas, numberToKorean } from "@web/utils/number-format";
import { CompleteRebalancingSheet } from "./complete-rebalancing-sheet";
import { justMovedFrom, takeJustMoved } from "./just-moved-tasks";
import { RebalancingResultSection } from "./rebalancing-result-section";

/** 체크된 할 일이 남은 목록에 머무는 시간. globals.css 의 task-leave (지연 500 + 300ms) 와 맞춘다. */
const TASK_LEAVE_MS = 800;

/**
 * 리밸런싱 할 일 체크리스트. 권장 수량은 시작할 때의 가격으로 고정된 스냅샷이라 시세가
 * 바뀌어도 그대로다. 종목별 매도/매수를 하나씩 체크하고, 모두 마치면 "리밸런싱 완료하기"로
 * 완료 기록을 남긴다 (원하면 계좌에도 반영).
 */
export function RebalancingSessionMobile({ id }: { id: string }) {
  const session = useRebalancingStore((s) => s.sessions.find((x) => x.id === id));
  const removeRebalancing = useRebalancingStore((s) => s.removeRebalancing);
  const { pop, push } = useFlow();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [completing, setCompleting] = useState(false);
  const leaving = useLeavingTasks(session?.tasks);
  const [sortOpen, setSortOpen] = useState(false);
  // 정렬은 개인 설정 — 계정에 저장되어 어느 기기에서든 이어진다.
  const sort = usePreferencesStore((s) => s.rebalancingTaskSort);
  const setLocalSort = usePreferencesStore((s) => s.setRebalancingTaskSort);
  const setSort = (next: RebalancingTaskSort) => {
    setLocalSort(next);
    void pushRebalancingTaskSort(next);
  };
  // 섹션 접힘도 개인 설정 — 정렬처럼 계정에 저장한다.
  const collapsedSections = usePreferencesStore((s) => s.rebalancingCollapsedSections);
  const setLocalCollapsed = usePreferencesStore((s) => s.setRebalancingCollapsedSections);
  const toggleSection = (section: RebalancingTaskSection) => {
    const next = toggleCollapsedSection(collapsedSections, section);
    setLocalCollapsed(next);
    void pushRebalancingCollapsedSections(next);
  };
  const account = useInvestmentStore((s) =>
    s.investments.find((inv) => inv.id === session?.accountId)
  );
  // 매매를 누르면 체결 수량·가격 입력 화면으로 간다 (남은 매매는 완료 기록, 완료한 매매는 수정/완료 취소).
  const openTrade = (taskId: string) => push("RebalancingTrade", { id: session?.id ?? "", taskId });

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
  const groups = groupRebalancingTasks(session.tasks, leaving);
  // 평가액 = 지금 보유 수량 × 시작 시점 기준 가격 (가격이 고정된 체크리스트라 같은 기준을 쓴다).
  const holdingQuantity = (task: RebalancingTask) =>
    (account?.holdings ?? [])
      .filter((h) => stockPriceKey(h.market, h.ticker) === stockPriceKey(task.market, task.ticker))
      .reduce((sum, h) => sum + h.quantity, 0);
  const sectionTasks = {
    pending: sortRebalancingTasks(groups.pending, sort, holdingQuantity),
    ordered: sortRebalancingTasks(groups.ordered, sort, holdingQuantity),
    filled: sortRebalancingTasks(groups.filled, sort, holdingQuantity),
  };
  const { done, total } = rebalancingProgress(session);
  const remaining = total - done;
  const canComplete = canCompleteRebalancing(session);
  const stopped = isRebalancingStopped(session);

  return (
    <div className="pb-x4">
      {/* 권장 수량을 계산한 시작 시점 시세의 기준 시각 — 지금 시세가 아니다. */}
      {priceAsOf ? (
        <SnapshotPriceBanner summary={priceAsOf} live={!completed} />
      ) : (
        <PriceBanner title="가격 기준 시각이 기록되지 않았어요" />
      )}
      {cash && <CashOutlook cash={cash} cashDelta={session.cashDelta} />}

      {completed && (
        <div className="px-x4 pb-x4">
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

      <Divider />

      <section className="py-x4">
        <div className="flex items-center px-x4">
          <h2 className="t5-bold flex-1">
            리밸런싱 추천 종목{" "}
            <span className="text-fg-neutral-subtle tabular-nums">{total}건</span>
          </h2>
          {/* 어떤 정렬이든 매도가 매수보다 먼저 나온다. */}
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
        {groups.pending.length === 0 && groups.ordered.length === 0 && (
          <div className="flex flex-col items-center gap-x2 px-x4 py-x6">
            <p className="t4-regular text-fg-neutral-subtle">모든 매매를 마쳤어요.</p>
            {canComplete && (
              <ActionButton variant="ghost" size="small" onClick={() => setCompleting(true)}>
                리밸런싱 완료하기
              </ActionButton>
            )}
          </div>
        )}

        {/* 상태별 섹션 — 주문 전 → 주문 중 → 체결됨 순으로 내려가며 하나씩 끝내 간다. 빈 섹션은 숨긴다. */}
        {SECTIONS.map(({ key, title }) => {
          const tasks = sectionTasks[key];
          if (groups[key].length === 0) return null;
          const collapsed = collapsedSections.includes(key);
          return (
            <div key={key} className="pt-x2">
              <button
                type="button"
                className="flex w-full items-center gap-x1 px-x4 py-x2 text-left"
                aria-expanded={!collapsed}
                onClick={() => toggleSection(key)}
              >
                <h3 className="t4-bold flex-1">
                  {title}{" "}
                  <span className="text-fg-neutral-subtle tabular-nums">
                    {groups[key].length}건
                  </span>
                </h3>
                {/* 펼침 ⌄, 접힘 › */}
                <span
                  className={cn(
                    "text-fg-neutral-subtle flex transition-transform motion-reduce:transition-none",
                    collapsed && "-rotate-90"
                  )}
                >
                  <Icon svg={<IconChevronDownSmallLine />} />
                </span>
              </button>
              {!collapsed && (
                <TaskList tasks={tasks} leaving={leaving} disabled={completed} onOpen={openTrade} />
              )}
            </div>
          );
        })}
      </section>

      {/* 모든 매매를 마쳤으면 위 "모든 매매를 마쳤어요" 아래의 완료 버튼을 쓴다. */}
      {canComplete && remaining > 0 && (
        <div className="px-x4 pt-x2">
          <ActionButton size="large" className="w-full" onClick={() => setCompleting(true)}>
            리밸런싱 종료하기
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

function TaskList({
  tasks,
  leaving,
  disabled,
  onOpen,
}: {
  tasks: RebalancingTask[];
  leaving: ReadonlyMap<string, RebalancingTaskGroup>;
  disabled: boolean;
  onOpen: (taskId: string) => void;
}) {
  return (
    <List>
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          // 방금 주문·체결했으면 바뀐 모습을 보여준 뒤 접히며 빠지고, 다음 그룹으로 옮겨진다.
          leaving={leaving.has(task.id)}
          disabled={disabled}
          onOpen={() => onOpen(task.id)}
        />
      ))}
    </List>
  );
}

/** 할 일 한 줄. 왼쪽 상태 배지, 가운데 종목·총 금액, 오른쪽 권장 방향·수량·주당 가격. 누르면 매매 입력 화면. */
function TaskRow({
  task,
  leaving,
  disabled,
  onOpen,
}: {
  task: RebalancingTask;
  leaving: boolean;
  disabled: boolean;
  onOpen: () => void;
}) {
  return (
    <ListButtonItem
      // 체결한 매매도 흐리게·취소선 없이 그대로 보여준다 — 상태는 앞의 배지가 알려 준다.
      rootProps={{
        className: cn(leaving && "animate-task-leave overflow-hidden motion-reduce:animate-none"),
      }}
      // 대기 → 주문 → 체결 중 어디인지를 맨 앞에 — 체크 하나로는 주문과 체결을 구분할 수 없다.
      prefix={<TaskStatusBadge task={task} />}
      title={<span>{task.name || task.ticker || "(미선택)"}</span>}
      detail={<TaskDetail task={task} />}
      // 무엇을 몇 주, 주당 얼마에 — 방향 배지와 수량을 한 줄에, 그 아래 주당 가격을 두고 오른쪽
      // 정렬해 종목마다 수량·가격이 같은 세로선에 놓이게 한다.
      suffix={
        <span className="flex flex-col items-end gap-[2px]">
          <span className="flex items-center gap-x2">
            {/* 권장은 아직 주문하기 전에만 — 주문·체결한 뒤에는 실제로 한 매매라 방향만 적는다. */}
            <Badge tone={task.action === "매수" ? "positive" : "critical"} variant="outline">
              {rebalancingTaskStatus(task) === "pending" ? `${task.action} 권장` : task.action}
            </Badge>
            <TaskQuantity task={task} />
          </span>
          <TaskPrice task={task} />
        </span>
      }
      onClick={onOpen}
      // 완료된 기록은 계좌에 반영됐을 수 있어 매매를 바꾸지 않는다.
      disabled={disabled}
    />
  );
}

const STATUS_BADGE: Record<
  RebalancingTaskSection,
  { label: string; tone: "neutral" | "informative" | "positive" }
> = {
  pending: { label: "주문 전", tone: "neutral" },
  ordered: { label: "주문 중", tone: "informative" },
  filled: { label: "체결됨", tone: "positive" },
};

function TaskStatusBadge({ task }: { task: RebalancingTask }) {
  const { label, tone } = STATUS_BADGE[rebalancingTaskStatus(task)];
  return (
    <Badge tone={tone} variant="weak">
      {label}
    </Badge>
  );
}

const SECTIONS: { key: RebalancingTaskSection; title: string }[] = [
  { key: "pending", title: "주문 전" },
  { key: "ordered", title: "주문 중" },
  { key: "filled", title: "체결됨" },
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
function CashOutlook({ cash, cashDelta }: { cash: RebalancingCashOutlook; cashDelta: number }) {
  return (
    <section className="px-x4 py-x4">
      <p className="t3-regular text-fg-neutral-muted">남은 예수금</p>
      <p className={cn("t7-bold mt-[2px] tabular-nums", cash.now < 0 && "text-fg-critical")}>
        {formatSignedWon(cash.now)}
      </p>
      <p className="t3-regular text-fg-neutral-subtle mt-x1 tabular-nums">
        남은 매매 다 하면{" "}
        <span className={cn("t3-bold", cash.expected < 0 ? "text-fg-critical" : "text-fg-neutral")}>
          {formatSignedWon(cash.expected)}
        </span>
        {cash.heldForOrders > 0 && (
          <> · 매수 주문 {formatWithCommas(Math.round(cash.heldForOrders))}원 묶임</>
        )}
        {cashDelta !== 0 && (
          <>
            {" "}
            · {cashDelta > 0 ? "현금 투입" : "현금 인출"} {numberToKorean(Math.abs(cashDelta))} 포함
          </>
        )}
      </p>
    </section>
  );
}

/** 마이너스면 "−31,776원" (유니코드 마이너스). */
const formatSignedWon = (value: number) =>
  `${value < 0 ? "−" : ""}${formatWithCommas(Math.abs(Math.round(value)))}원`;

/**
 * 행에 보여줄 수량·주당 가격 — 상태마다 그때 정해진 값을 쓴다.
 * 대기: 권장 수량 · 시작 시점 가격 / 주문: 주문 수량 · 주문가 / 체결: 체결 수량 · 체결가.
 */
function shownTrade(task: RebalancingTask): { quantity: number | null; price: number | null } {
  switch (rebalancingTaskStatus(task)) {
    case "filled":
      return { quantity: executedQuantityOf(task), price: executedPriceOf(task) };
    case "ordered":
      return { quantity: task.orderedQuantity ?? null, price: task.orderedPrice ?? null };
    case "pending":
      return { quantity: task.quantity, price: task.price };
  }
}

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
  const differs = !!quantity && task.quantity !== null && quantity !== task.quantity;
  const total = quantity !== null && price !== null ? Math.round(quantity * price) : null;
  if (total === null && !differs) return null;
  return (
    <span className="tabular-nums">
      {total !== null && <>총 {formatWithCommas(total)}원</>}
      {total !== null && differs && " · "}
      {differs && <>권장 {formatWithCommas(task.quantity ?? 0)}주</>}
    </span>
  );
}
