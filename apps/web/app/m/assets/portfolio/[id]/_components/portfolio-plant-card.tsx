"use client";

import { useState } from "react";
import { formatMoneyDraft } from "@web/components/mobile/input-format";
import { MoneyField } from "@web/components/mobile/money-field";
import { PLANT_STAGE_LABELS } from "@web/features/portfolio/types/constants";
import type { PlantProgress } from "@web/features/portfolio/types/types";
import {
  lastReachedGoal,
  PLANT_GOAL_ERROR_MESSAGES,
  type PlantStatus,
  plantGoalError,
} from "@web/features/portfolio/utils/portfolio-plant";
import { ActionButton } from "@web/seed-design/ui/action-button";
import {
  BottomSheetBody,
  BottomSheetContent,
  BottomSheetFooter,
  BottomSheetRoot,
} from "@web/seed-design/ui/bottom-sheet";
import { numberToKorean, parseNumericString } from "@web/utils/number-format";
import { SummaryRow } from "./summary-row";

/** 목표 상태를 짧게. */
function describeGoal(status: PlantStatus): string {
  if (status.goalState === "complete") return "다 자랐어요";
  if (status.goalState === "needs-goal") {
    return status.stage === 0 ? "목표를 정하면 자라요" : "목표 달성!";
  }
  // 남은 금액이 먼저 — 좁으면 뒤의 목표 금액이 다음 줄로 간다.
  return `${numberToKorean(status.remainingToNextStage ?? 0) || "0원"} 남음 (목표 ${numberToKorean(status.goalAmount ?? 0)})`;
}

/**
 * 포트폴리오 상세 상단 요약의 식물 한 줄: 단계·목표·남은 금액 + 목표 정하기.
 * 식물 그림은 상단 금액 옆 아바타가 보여준다.
 */
export function PortfolioPlantRow({ status, onEdit }: { status: PlantStatus; onEdit: () => void }) {
  return (
    <SummaryRow
      label="식물"
      action={
        status.goalState !== "complete" && (
          <ActionButton
            variant="neutralWeak"
            size="xsmall"
            onClick={onEdit}
            aria-label="식물 목표 수정"
          >
            {status.goalState === "set" ? "수정" : "목표 정하기"}
          </ActionButton>
        )
      }
    >
      {`${PLANT_STAGE_LABELS[status.stage]} · ${describeGoal(status)}`}
      {status.drooping && <span className="text-fg-warning"> (시들해요)</span>}
    </SummaryRow>
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
