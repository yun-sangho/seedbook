"use client";

import { useMemo, useState } from "react";
import { IconChevronRightLine, IconPlusLine } from "@karrotmarket/react-monochrome-icon";
import { Divider, Icon } from "@seed-design/react";
import { useFlow } from "@stackflow/react";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { RebalancingProgressBar } from "@web/features/rebalancing/components/rebalancing-progress-bar";
import { useRebalancingStore } from "@web/features/rebalancing/stores/rebalancing-store";
import type { RebalancingSession } from "@web/features/rebalancing/types/types";
import { formatRebalancingDate } from "@web/features/rebalancing/utils/format-rebalancing-date";
import {
  isRebalancingCompleted,
  isRebalancingStopped,
  rebalancingProgress,
} from "@web/features/rebalancing/utils/rebalancing-session";
import { ActionButton } from "@web/seed-design/ui/action-button";
import { Badge } from "@web/seed-design/ui/badge";
import {
  ChipTabsContent,
  ChipTabsList,
  ChipTabsRoot,
  ChipTabsTrigger,
} from "@web/seed-design/ui/chip-tabs";
import { ResultSection } from "@web/seed-design/ui/result-section";

const FALLBACK_DOT_COLOR = "#cbd5e1";

type Tab = "in-progress" | "completed";

/**
 * 하단 탭 "리밸런싱": 진행 중인 리밸런싱(할 일 목록)과 완료 기록을 탭으로 나눠 보여준다.
 * "새 리밸런싱" 으로 들어가면 계좌를 골라 권장 매매를 계산하고 시작할 수 있다.
 */
export function RebalancingHomeMobile() {
  const sessions = useRebalancingStore((s) => s.sessions);
  const { push } = useFlow();
  const [tab, setTab] = useState<Tab>("in-progress");

  const { inProgress, completed } = useMemo(() => {
    const active: RebalancingSession[] = [];
    const done: RebalancingSession[] = [];
    for (const s of sessions) (isRebalancingCompleted(s) ? done : active).push(s);
    // 기록은 최근에 끝난 것부터.
    done.sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
    return { inProgress: active, completed: done };
  }, [sessions]);

  const startNew = () => push("RebalancingNew", {});

  if (sessions.length === 0) {
    return (
      <div className="flex min-h-[60dvh] flex-col">
        <ResultSection
          title="진행 중인 리밸런싱이 없어요"
          description="계좌를 골라 목표 비중과의 차이를 계산하고, 사고팔 종목을 매매 목록으로 만들어 하나씩 처리하세요."
          primaryActionProps={{ children: "새 리밸런싱", onClick: startNew }}
        />
      </div>
    );
  }

  return (
    <div className="pb-x4">
      <ChipTabsRoot
        value={tab}
        onValueChange={(value) => setTab(value as Tab)}
        variant="neutralSolid"
        size="medium"
        className="pt-x4"
      >
        <ChipTabsList>
          <ChipTabsTrigger value="in-progress">진행 중 {inProgress.length}</ChipTabsTrigger>
          <ChipTabsTrigger value="completed">완료 기록 {completed.length}</ChipTabsTrigger>
        </ChipTabsList>
        <ChipTabsContent value="in-progress">
          <SessionList
            sessions={inProgress}
            emptyText="진행 중인 리밸런싱이 없어요."
            onOpen={(id) => push("RebalancingSession", { id })}
          />
        </ChipTabsContent>
        <ChipTabsContent value="completed">
          <SessionList
            sessions={completed}
            emptyText="아직 완료한 리밸런싱이 없어요. 매매를 모두 마치고 완료하면 여기에 기록돼요."
            onOpen={(id) => push("RebalancingSession", { id })}
          />
        </ChipTabsContent>
      </ChipTabsRoot>
      <Divider />
      <div className="flex justify-center pt-x4">
        <ActionButton variant="ghost" size="medium" onClick={startNew}>
          <Icon svg={<IconPlusLine />} />새 리밸런싱
        </ActionButton>
      </div>
    </div>
  );
}

function SessionList({
  sessions,
  emptyText,
  onOpen,
}: {
  sessions: RebalancingSession[];
  emptyText: string;
  onOpen: (id: string) => void;
}) {
  if (sessions.length === 0) {
    return <p className="t4-regular text-fg-neutral-subtle px-x4 py-x6 text-center">{emptyText}</p>;
  }
  return (
    <div className="pt-x2">
      {sessions.map((session, index) => (
        <SessionRow
          key={session.id}
          session={session}
          withDivider={index > 0}
          onClick={() => onOpen(session.id)}
        />
      ))}
    </div>
  );
}

function SessionRow({
  session,
  withDivider,
  onClick,
}: {
  session: RebalancingSession;
  withDivider: boolean;
  onClick: () => void;
}) {
  // 계좌가 남아 있으면 현재 이름·색을, 지워졌으면 시작할 때의 이름을 쓴다.
  const account = useInvestmentStore((s) =>
    s.investments.find((inv) => inv.id === session.accountId)
  );
  const { done, total } = rebalancingProgress(session);
  const completed = isRebalancingCompleted(session);
  const stopped = isRebalancingStopped(session);
  const sellCount = session.tasks.filter((t) => t.action === "매도").length;
  const buyCount = total - sellCount;

  return (
    <div>
      {withDivider && <Divider inset />}
      <button
        type="button"
        onClick={onClick}
        className="active:bg-bg-layer-default-pressed flex w-full items-center gap-x3 px-x4 py-x4 text-left"
      >
        <span
          className="size-x3 shrink-0 rounded-full"
          style={{ backgroundColor: account?.color ?? FALLBACK_DOT_COLOR }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-x2">
            <p className="t5-bold min-w-0 truncate">
              {account?.accountName || session.accountName || "이름 없는 계좌"}
            </p>
            {completed && (
              <Badge tone={stopped ? "warning" : "positive"} variant="weak" className="shrink-0">
                {stopped ? "중지" : "완료"}
              </Badge>
            )}
          </div>
          <p className="t3-regular text-fg-neutral-subtle mt-[2px] truncate tabular-nums">
            {session.portfolioName} ·{" "}
            {completed
              ? `${formatRebalancingDate(session.completedAt ?? "")} ${stopped ? "중지" : "완료"} · 매도 ${sellCount} · 매수 ${buyCount}`
              : `${formatRebalancingDate(session.startedAt)} 시작`}
          </p>
          {!completed && <RebalancingProgressBar done={done} total={total} />}
        </div>
        <Icon svg={<IconChevronRightLine />} size="x5" color="fg.neutralSubtle" />
      </button>
    </div>
  );
}
