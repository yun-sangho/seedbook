"use client";

import { useState } from "react";
import { formatMoneyDraft } from "@mobile/components/mobile/input-format";
import { MoneyField } from "@mobile/components/mobile/money-field";
import { GoalBar, goalPercentOf } from "@mobile/features/garden/components/goal-bar";
import { PlantAvatar } from "@mobile/features/garden/components/plant-avatar";
import { PLANT_KIND_LABELS, PLANT_KINDS } from "@mobile/features/garden/plant-3d/plant-options";
import { plantConditionLabel, plantStageLabel } from "@mobile/features/garden/utils/garden-home";
import { MAX_PLANT_STAGE } from "@mobile/features/portfolio/types/constants";
import type { PlantKind, PlantProgress } from "@mobile/features/portfolio/types/types";
import {
  NEXT_GOAL_ERROR_MESSAGES,
  nextGoalError,
  nextGoalFloor,
  WISH_MAX_LENGTH,
  wishError,
} from "@mobile/features/portfolio/utils/plant-season";
import type { PortfolioValuation } from "@mobile/features/portfolio/utils/portfolio-plant";
import type { PortfolioPlantView } from "@mobile/features/portfolio/utils/portfolio-plant-view";
import { ActionButton } from "@mobile/seed-design/ui/action-button";
import {
  BottomSheetBody,
  BottomSheetContent,
  BottomSheetFooter,
  BottomSheetRoot,
} from "@mobile/seed-design/ui/bottom-sheet";
import { SegmentedControl, SegmentedControlItem } from "@mobile/seed-design/ui/segmented-control";
import { TextField, TextFieldInput } from "@mobile/seed-design/ui/text-field";
import { numberToKorean, parseNumericString } from "@mobile/utils/number-format";

/** 식물 줄에서 누를 수 있는 것 — 목표(열매 목표) 정하기, 리밸런싱 보기, 수확, 씨앗 심기(종류·소원). */
export type PlantRowAction = "goal" | "rebalance" | "harvest" | "season";

/** 목표 상태별 버튼 문구와 할 일. */
function rowButton(plant: PortfolioPlantView): { label: string; action: PlantRowAction } {
  switch (plant.goalState) {
    case "set":
      return { label: "수정", action: "goal" };
    case "needs-goal":
      // 목표가 없는 씨앗은 아직 심지 않은 것 — 종류·첫 목표·소원을 함께 정한다.
      return plant.stage === 0
        ? { label: "씨앗 심기", action: "season" }
        : { label: "목표 정하기", action: "goal" };
    case "needs-fruit-goal":
      return { label: "열매 목표 정하기", action: "goal" };
    case "blocked-by-drift":
      return { label: "리밸런싱 보기", action: "rebalance" };
    case "ripe":
      return { label: "수확하기", action: "harvest" };
  }
}

/**
 * 포트폴리오 상세 상단 요약의 식물 줄: 단계 이름 + 상태(시듦·바람·열매) + 목표 도달 막대(정원 목록과 같은
 * 모양) + 목표 상태에 맞는 버튼, 그 아래 하고 싶은 일. 식물 그림은 상단 금액 옆 아바타가 보여준다.
 */
export function PortfolioPlantRow({
  plant,
  onAction,
}: {
  plant: PortfolioPlantView;
  onAction: (action: PlantRowAction) => void;
}) {
  const condition = plantConditionLabel(plant);
  const button = rowButton(plant);
  // 수확할 수 있으면 그것만 — 단계·막대·소원은 수확 뒤 다시 심으면 보인다.
  if (plant.ripe) {
    return (
      <div className="flex min-h-x12 items-center gap-x3 py-x2">
        <span className="t4-bold min-w-0 flex-1">열매가 열렸어요</span>
        <ActionButton
          variant="neutralSolid"
          size="xsmall"
          onClick={() => onAction("harvest")}
          aria-label="식물 수확하기"
        >
          수확하기
        </ActionButton>
      </div>
    );
  }
  return (
    <div className="py-x2">
      <div className="flex min-h-x10 items-center gap-x3">
        <span className="t4-bold shrink-0">
          {plantStageLabel(plant.kind, plant.stage, plant.empty)}
          {condition && (
            <span
              className={`t3-regular ${plant.wilt > 0 && !plant.ripe ? "text-fg-warning" : ""}`}
            >
              {" "}
              · {condition}
            </span>
          )}
        </span>
        <GoalBar
          className="min-w-0 flex-1"
          stage={plant.stage}
          goalState={plant.goalState}
          goalPercent={goalPercentOf(plant.value, plant.goalAmount)}
          wilt={plant.wilt}
          wind={plant.wind}
          ariaLabel="식물 목표 도달"
        />
        <ActionButton
          variant="neutralWeak"
          size="xsmall"
          onClick={() => onAction(button.action)}
          aria-label={`식물 ${button.label}`}
        >
          {button.label}
        </ActionButton>
      </div>
      {/* 하고 싶은 일은 씨앗을 심을 때만 적는다 — 여기서는 보여 주기만. */}
      {plant.wish && (
        <p className="t3-regular text-fg-neutral-subtle truncate">🌱 이루면: {plant.wish}</p>
      )}
    </div>
  );
}

/**
 * 식물의 지금 목표 금액을 정하거나 지우는 시트. 4단계(꽃)에서는 열매 목표다. 다음 목표는 지금 평가금액과
 * 지난 목표 중 큰 값의 +10% 이상이고, 시세가 다 오기 전에는 받지 않는다 (`nextGoalError`).
 */
export function EditPlantGoalSheet({
  open,
  onOpenChange,
  progress,
  valuation,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  progress: PlantProgress;
  valuation: Pick<PortfolioValuation, "value" | "pricesComplete">;
  /** `null` 이면 목표를 지운다. */
  onSave: (amount: number | null) => void;
}) {
  const [draft, setDraft] = useState(
    progress.goalAmount === null ? "" : formatMoneyDraft(String(progress.goalAmount))
  );
  const [error, setError] = useState<string | undefined>();
  const floor = nextGoalFloor(progress, valuation);
  const fruit = progress.growthStage >= MAX_PLANT_STAGE;
  const title = fruit ? "열매 목표 금액" : "식물 목표 금액";

  const save = () => {
    const invalid = nextGoalError(progress, parseNumericString(draft), valuation);
    if (invalid) {
      setError(NEXT_GOAL_ERROR_MESSAGES[invalid](floor));
      return;
    }
    onSave(parseNumericString(draft));
    onOpenChange(false);
  };

  return (
    <BottomSheetRoot open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent title={title} showHandle>
        <BottomSheetBody>
          <p className="t4-regular text-fg-neutral-subtle pb-x3">
            {fruit
              ? "포트폴리오 금액이 열매 목표에 닿고 비중이 기준 안이면 열매가 열려요."
              : "포트폴리오 금액이 목표에 닿고 비중이 기준 안이면 식물이 한 단계 자라요."}{" "}
            {floor === null
              ? NEXT_GOAL_ERROR_MESSAGES["prices-loading"](null)
              : floor > 0 &&
                `${numberToKorean(floor)} 이상으로 정할 수 있어요 (지금보다 10% 이상).`}
          </p>
          <MoneyField
            ariaLabel={title}
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
            {/* 씨앗의 목표를 지우면 빈 화분으로 돌아간다. */}
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

/**
 * 씨앗 심기 시트의 제목·설명. 방금 수확했으면(`harvestedWish` 가 있으면) 다시 심기. 화면 문구는 수확
 * 중심이다 — 몇 번째인지 세지 않는다 (`season` 은 화면에 보이지 않는 수확 주기 번호).
 */
export function plantSeasonSheetText(harvestedWish: string | undefined): {
  title: string;
  description?: string;
} {
  if (harvestedWish !== undefined) {
    const basket = harvestedWish
      ? `"${harvestedWish}" 열매를 바구니에 담았어요.`
      : "열매를 바구니에 담았어요.";
    return {
      title: "다시 씨앗 심기",
      description: `${basket} 다음에 키울 식물과 하고 싶은 일을 정해요.`,
    };
  }
  return { title: "씨앗 심기" };
}

/**
 * 씨앗 심기 시트 — 식물 종류, 첫 목표(필수, 하한 `nextGoalError`), 목표를 이루면 하고 싶은
 * 일(선택). 목표 없는 씨앗일 때만 연다 (빈 화분, 수확 뒤 다시 심기).
 */
export function PlantSeasonSheet({
  open,
  onOpenChange,
  title,
  description,
  initialKind,
  initialWish,
  progress,
  valuation,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  initialKind: PlantKind;
  initialWish: string;
  progress: Pick<PlantProgress, "goalHistory" | "fruitGoal">;
  valuation: Pick<PortfolioValuation, "value" | "pricesComplete">;
  onSave: (input: { plantKind: PlantKind; wish: string; goalAmount: number }) => void;
}) {
  const [kind, setKind] = useState<PlantKind>(initialKind);
  const [wish, setWish] = useState(initialWish);
  const [goalDraft, setGoalDraft] = useState("");
  const [goalError, setGoalError] = useState<string | undefined>();
  const invalid = wishError(wish) !== null;
  const floor = nextGoalFloor(progress, valuation);

  const plant = () => {
    const goalAmount = goalDraft.trim() === "" ? 0 : parseNumericString(goalDraft);
    const error = nextGoalError(progress, goalAmount, valuation);
    if (error) {
      setGoalError(NEXT_GOAL_ERROR_MESSAGES[error](floor));
      return;
    }
    onSave({ plantKind: kind, wish: wish.trim(), goalAmount });
    onOpenChange(false);
  };

  return (
    <BottomSheetRoot open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent title={title} showHandle>
        <BottomSheetBody>
          <p className="t4-regular text-fg-neutral-subtle pb-x3">
            {description ?? "목표 다섯 개를 이루면 열매를 수확해 바구니에 담아요."}
          </p>
          <div className="flex flex-col items-center gap-x3 pb-x4">
            <PlantAvatar stage="sapling" kind={kind} size={72} />
            <SegmentedControl
              aria-label="식물 종류"
              value={kind}
              onValueChange={(next) => setKind(next as PlantKind)}
              className="w-full"
            >
              {PLANT_KINDS.map((k) => (
                <SegmentedControlItem key={k} value={k}>
                  {PLANT_KIND_LABELS[k]}
                </SegmentedControlItem>
              ))}
            </SegmentedControl>
          </div>
          <div className="pb-x3">
            <MoneyField
              label="첫 목표 금액"
              ariaLabel="첫 목표 금액"
              value={goalDraft}
              onValueChange={(next) => {
                setGoalDraft(next);
                setGoalError(undefined);
              }}
              errorMessage={goalError}
            />
            <p className="t3-regular text-fg-neutral-subtle pt-x1">
              {floor === null
                ? NEXT_GOAL_ERROR_MESSAGES["prices-loading"](null)
                : floor > 0
                  ? `${numberToKorean(floor)} 이상 (지금보다 10% 이상). 금액이 닿고 비중이 기준 안이면 자라요.`
                  : "금액이 닿고 비중이 기준 안이면 자라요."}
            </p>
          </div>
          <TextField
            label="이루면 하고 싶은 일"
            value={wish}
            onValueChange={({ value }) => setWish(value)}
            description="비워 둬도 돼요"
            maxGraphemeCount={WISH_MAX_LENGTH}
            invalid={invalid}
          >
            <TextFieldInput placeholder="예: 부모님과 제주 여행" maxLength={WISH_MAX_LENGTH} />
          </TextField>
        </BottomSheetBody>
        <BottomSheetFooter>
          <ActionButton size="large" className="w-full" disabled={invalid} onClick={plant}>
            심기
          </ActionButton>
        </BottomSheetFooter>
      </BottomSheetContent>
    </BottomSheetRoot>
  );
}
