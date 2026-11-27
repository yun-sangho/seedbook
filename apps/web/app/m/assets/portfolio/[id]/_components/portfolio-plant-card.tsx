"use client";

import { useState } from "react";
import { formatMoneyDraft } from "@web/components/mobile/input-format";
import { MoneyField } from "@web/components/mobile/money-field";
import { PortfolioPlantAvatar } from "@web/features/portfolio/components/portfolio-plant-avatar";
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

const PLANT_CARD_AVATAR_SIZE = 72;

/** 목표 상태를 한 줄로. */
function describePlant(status: PlantStatus): string {
  if (status.goalState === "complete") return "꽃·열매까지 다 자랐어요";
  if (status.goalState === "needs-goal") {
    return status.stage === 0
      ? "목표를 정하면 자라기 시작해요"
      : "목표를 달성했어요! 다음 목표를 정해 주세요";
  }
  return `목표 ${numberToKorean(status.goalAmount ?? 0)} · ${numberToKorean(status.remainingToNextStage ?? 0) || "0원"} 남음`;
}

/**
 * 포트폴리오 식물의 2D 모습(정원과 같은 단계·화분 색, 리밸런싱 필요면 `!`)과 단계·목표.
 */
export function PortfolioPlantCard({
  portfolioId,
  status,
  needsRebalance,
  onEdit,
}: {
  portfolioId: string;
  status: PlantStatus;
  needsRebalance: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="border-stroke-neutral-muted rounded-r3 mt-x3 border-2 px-x4 py-x3">
      <div className="flex items-center gap-x3">
        <PortfolioPlantAvatar
          portfolioId={portfolioId}
          stage={status.stage}
          size={PLANT_CARD_AVATAR_SIZE}
          needsRebalance={needsRebalance}
        />
        <div className="min-w-0 flex-1">
          <p className="t3-regular text-fg-neutral-subtle">
            식물 · {PLANT_STAGE_LABELS[status.stage]}
            {status.drooping && " (시들해요)"}
          </p>
          <p className="t5-bold mt-[2px] tabular-nums">{describePlant(status)}</p>
        </div>
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
