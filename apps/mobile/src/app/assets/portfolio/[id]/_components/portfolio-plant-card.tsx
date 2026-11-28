"use client";

import { useState } from "react";
import { formatMoneyDraft } from "@mobile/components/mobile/input-format";
import { MoneyField } from "@mobile/components/mobile/money-field";
import { GoalBar, goalPercentOf } from "@mobile/features/garden/components/goal-bar";
import { PLANT_STAGE_LABELS } from "@mobile/features/portfolio/types/constants";
import type { PlantProgress } from "@mobile/features/portfolio/types/types";
import {
  lastReachedGoal,
  PLANT_GOAL_ERROR_MESSAGES,
  type PlantStatus,
  plantGoalError,
} from "@mobile/features/portfolio/utils/portfolio-plant";
import { ActionButton } from "@mobile/seed-design/ui/action-button";
import {
  BottomSheetBody,
  BottomSheetContent,
  BottomSheetFooter,
  BottomSheetRoot,
} from "@mobile/seed-design/ui/bottom-sheet";
import { numberToKorean, parseNumericString } from "@mobile/utils/number-format";

/**
 * 포트폴리오 상세 상단 요약의 식물 한 줄: 지금 단계 이름 + 목표 도달 막대(정원 목록과 같은 모양) +
 * 목표 정하기. 식물 그림은 상단 금액 옆 아바타가 보여준다.
 */
export function PortfolioPlantRow({
  status,
  value,
  onEdit,
}: {
  status: PlantStatus;
  /** 포트폴리오 평가 금액 (원) — 막대를 채운다. */
  value: number;
  onEdit: () => void;
}) {
  return (
    <div className="flex min-h-x12 items-center gap-x3 py-x2">
      <span className={`t4-bold shrink-0 ${status.drooping ? "text-fg-warning" : ""}`}>
        {PLANT_STAGE_LABELS[status.stage]}
        {status.drooping && <span className="t3-regular"> · 시들해요</span>}
      </span>
      <GoalBar
        className="min-w-0 flex-1"
        stage={status.stage}
        goalState={status.goalState}
        goalPercent={goalPercentOf(value, status.goalAmount)}
        drooping={status.drooping}
        ariaLabel="식물 목표 도달"
      />
      {status.goalState !== "complete" && (
        <ActionButton
          variant="neutralWeak"
          size="xsmall"
          onClick={onEdit}
          aria-label="식물 목표 수정"
        >
          {status.goalState === "set" ? "수정" : "목표 정하기"}
        </ActionButton>
      )}
    </div>
  );
}

/** 식물의 지금 목표 금액을 정하거나 지우는 시트. */
export function EditPlantGoalSheet({
  open,
  onOpenChange,
  progress,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  progress: PlantProgress;
  /** `null` 이면 목표를 지운다. */
  onSave: (amount: number | null) => void;
}) {
  const [draft, setDraft] = useState(
    progress.goalAmount === null ? "" : formatMoneyDraft(String(progress.goalAmount))
  );
  const [error, setError] = useState<string | undefined>();
  const last = lastReachedGoal(progress);

  const save = () => {
    const amount = parseNumericString(draft);
    const invalid = plantGoalError(progress, amount);
    if (invalid) {
      setError(PLANT_GOAL_ERROR_MESSAGES[invalid]);
      return;
    }
    onSave(amount);
    onOpenChange(false);
  };

  return (
    <BottomSheetRoot open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent title="식물 목표 금액" showHandle>
        <BottomSheetBody>
          <p className="t4-regular text-fg-neutral-subtle pb-x3">
            포트폴리오 금액이 목표에 닿으면 식물이 한 단계 자라요.
            {last && ` 지난 목표는 ${numberToKorean(last.amount)}이었어요.`}
          </p>
          <MoneyField
            ariaLabel="식물 목표 금액"
            value={draft}
            onValueChange={(next) => {
              setDraft(next);
              setError(undefined);
            }}
            errorMessage={error}
            autoFocus
          />
        </BottomSheetBody>
        <BottomSheetFooter>
          <div className="flex w-full gap-x2">
            {progress.goalAmount !== null && (
              <ActionButton
                variant="neutralWeak"
                size="large"
                flexGrow
                onClick={() => {
                  onSave(null);
                  onOpenChange(false);
                }}
              >
                목표 지우기
              </ActionButton>
            )}
            <ActionButton size="large" flexGrow onClick={save}>
              저장
            </ActionButton>
          </div>
        </BottomSheetFooter>
      </BottomSheetContent>
    </BottomSheetRoot>
  );
}
