import type { PlantStage } from "@mobile/features/portfolio/types/types";
import type { SeasonGoalState } from "@mobile/features/portfolio/utils/plant-season";

interface GoalBarInput {
  stage: PlantStage;
  goalState: SeasonGoalState;
  /** 최종 목표 대비 % (목표가 없으면 null). */
  goalPercent: number | null;
  /** 시듦 (비중 이탈 기간). 있으면 경고색. */
  wilt: number;
  /** 바람 (시장 하락). 있으면 중립색 + "바람이 불어요". */
  wind: number;
}

/** 막대 색 — 기본 브랜드, 바람이면 중립(기다리면 지나간다), 시들면 경고(비중을 맞추면 회복). */
export type GoalBarTone = "brand" | "neutral" | "warning";

const TONE_CLASS: Record<GoalBarTone, string> = {
  brand: "bg-bg-brand-solid",
  neutral: "bg-bg-neutral-solid-muted",
  warning: "bg-bg-warning-solid",
};

/**
 * 목표 도달 막대: 채울 비율(%, 막대 없으면 null), 옆 문구, 색. 목표를 향해 자라는 중이면 막대만(바람이면
 * "바람이 불어요"), 목표가 없는 씨앗은 막대 없이 문구만, 방금 달성했거나 꽃이 피었거나 열매가 열렸으면
 * 꽉 찬 막대 + 문구. (정원 목록과 같은 규칙)
 */
export function goalBarState({ stage, goalState, goalPercent, wilt, wind }: GoalBarInput): {
  percent: number | null;
  label: string | null;
  tone: GoalBarTone;
} {
  // 이룬 열매는 시듦·바람과 상관없이 그대로 보인다.
  if (goalState === "ripe") return { percent: 100, label: "열매가 열렸어요", tone: "brand" };
  const tone: GoalBarTone = wilt > 0 ? "warning" : wind > 0 ? "neutral" : "brand";
  switch (goalState) {
    case "needs-fruit-goal":
      return { percent: 100, label: "꽃이 피었어요", tone };
    case "needs-goal":
      return stage === 0
        ? { percent: null, label: "목표를 더하면 씨앗을 심어요", tone }
        : { percent: 100, label: "목표 달성!", tone };
    case "blocked-by-drift":
      return { percent: goalPercent ?? 100, label: "비중을 맞추면 자라요", tone };
    case "set":
      return { percent: goalPercent ?? 0, label: wind > 0 ? "바람이 불어요" : null, tone };
  }
}

/** 식물의 목표 도달 막대 (정원 목록의 막대와 같은 모양). */
export function GoalBar({
  ariaLabel,
  className,
  ...input
}: GoalBarInput & { ariaLabel: string; className?: string }) {
  const { percent, label, tone } = goalBarState(input);
  if (percent === null) {
    return (
      <span className={`t2-medium text-fg-neutral-subtle block ${className ?? ""}`}>{label}</span>
    );
  }
  return (
    <span className={`flex items-center gap-x2 ${className ?? ""}`}>
      <span
        role="progressbar"
        aria-label={ariaLabel}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="bg-bg-neutral-weak block h-[6px] min-w-0 flex-1 overflow-hidden rounded-full"
      >
        <span
          className={`block h-full rounded-full ${TONE_CLASS[tone]}`}
          style={{ width: `${percent}%` }}
        />
      </span>
      {label && (
        <span className="t2-medium text-fg-neutral-subtle shrink-0 tabular-nums">{label}</span>
      )}
    </span>
  );
}
