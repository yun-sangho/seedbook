import type { PlantStage } from "@web/features/portfolio/types/types";
import type { PlantGoalState } from "@web/features/portfolio/utils/portfolio-plant";

interface GoalBarInput {
  stage: PlantStage;
  goalState: PlantGoalState;
  /** 목표 대비 % (목표가 없으면 null). */
  goalPercent: number | null;
}

/** 목표 대비 % (0~100, 소수 버림). 목표가 없으면 null. 정원 목록 행과 같은 계산. */
export function goalPercentOf(value: number, goalAmount: number | null): number | null {
  if (goalAmount === null || goalAmount <= 0) return null;
  return Math.min(100, Math.floor((Math.max(0, value) / goalAmount) * 100));
}

/**
 * 목표 도달 막대: 채울 비율(%, 막대 없으면 null)과 옆 문구. 목표를 향해 자라는 중이면 막대만, 목표가
 * 없는 씨앗은 막대 없이 문구만, 방금 달성했거나 다 자랐으면 꽉 찬 막대 + 문구. (정원 목록과 같은 규칙)
 */
export function goalBarState({ stage, goalState, goalPercent }: GoalBarInput): {
  percent: number | null;
  label: string | null;
} {
  if (goalState === "complete") return { percent: 100, label: "다 자랐어요" };
  if (goalState === "needs-goal") {
    return stage === 0
      ? { percent: null, label: "목표를 정하면 자라요" }
      : { percent: 100, label: "목표 달성!" };
  }
  return { percent: goalPercent ?? 0, label: null };
}

/** 식물의 목표 도달 막대 (정원 목록의 막대와 같은 모양). 시들면 경고색. */
export function GoalBar({
  drooping,
  ariaLabel,
  className,
  ...input
}: GoalBarInput & { drooping: boolean; ariaLabel: string; className?: string }) {
  const { percent, label } = goalBarState(input);
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
          className={`block h-full rounded-full ${drooping ? "bg-bg-warning-solid" : "bg-bg-brand-solid"}`}
          style={{ width: `${percent}%` }}
        />
      </span>
      {label && (
        <span className="t2-medium text-fg-neutral-subtle shrink-0 tabular-nums">{label}</span>
      )}
    </span>
  );
}
