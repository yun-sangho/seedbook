"use client";

import { useState } from "react";
import { formatMoneyDraft } from "@mobile/components/mobile/input-format";
import { MoneyField } from "@mobile/components/mobile/money-field";
import { GoalBar } from "@mobile/features/garden/components/goal-bar";
import { PlantAvatar } from "@mobile/features/garden/components/plant-avatar";
import { PLANT_KIND_LABELS, PLANT_KINDS } from "@mobile/features/garden/plant-3d/plant-options";
import { kstDay } from "@mobile/features/garden/utils/basket";
import { plantConditionLabel, plantStageLabel } from "@mobile/features/garden/utils/garden-home";
import type { PlantKind, PlantProgress } from "@mobile/features/portfolio/types/types";
import {
  finalGoalOf,
  NEXT_GOAL_ERROR_MESSAGES,
  nextGoalError,
  nextGoalFloor,
  PLANT_NAME_MAX_LENGTH,
  plantNameError,
  WISH_MAX_LENGTH,
  wishError,
  wishHistoryNewestFirst,
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

/**
 * 식물 줄에서 누를 수 있는 것 — 목표(열매 목표) 정하기, 리밸런싱 보기, 수확, 씨앗 심기(종류·이름·소원),
 * 소원 고치기(이력 보기).
 */
export type PlantRowAction = "goal" | "rebalance" | "harvest" | "season" | "wish";

/** 목표 상태별 버튼 문구와 할 일. */
function rowButton(plant: PortfolioPlantView): { label: string; action: PlantRowAction } {
  switch (plant.goalState) {
    case "set":
      return { label: "수정", action: "goal" };
    case "needs-goal":
      // 목표가 없는 씨앗은 아직 심지 않은 것 — 종류·이름·목표·소원을 함께 정한다.
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
 * 모양) + 목표 상태에 맞는 버튼, 그 아래 하고 싶은 일 (누르면 고치기·이력). 식물 이름이 있으면 단계 앞에
 * 둔다. 식물 그림은 상단 금액 옆 아바타가 보여준다.
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
        <span className="t4-bold min-w-0 shrink truncate">
          {plant.plantName && `${plant.plantName} · `}
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
          goalPercent={plant.goalPercent}
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
      {/* 빈 화분은 씨앗 심기에서 소원을 적는다. 심은 뒤에는 언제든 고친다 (이력이 남는다). */}
      {!plant.empty && (
        <button
          type="button"
          className="t3-regular text-fg-neutral-subtle flex w-full min-w-0 items-center gap-x1 py-x1 text-left"
          onClick={() => onAction("wish")}
        >
          <span className="min-w-0 truncate">
            {plant.wish ? `🌱 이루면: ${plant.wish}` : "🌱 이루면 하고 싶은 일 적기"}
          </span>
          <span aria-hidden className="shrink-0">
            ›
          </span>
        </button>
      )}
    </div>
  );
}

/** 목표를 향해 어떻게 자라는지 (씨앗 심기·목표 수정 시트). */
const GROWTH_HINT =
  "목표에 가까워질수록 자라요. 처음엔 빨리, 목표에 가까울수록 천천히 자라고, 비중이 기준 안이어야 자라요.";

/**
 * 식물의 목표(수확까지의 최종 목표)를 고치거나 지우는 시트. 고치면 남은 단계 목표를 지금부터 다시 나눈다
 * (`setSeasonGoal`). 목표는 지금 평가금액과 이룬 단계 목표 중 큰 값의 +10% 이상이고, 시세가 다 오기 전에는
 * 받지 않는다 (`nextGoalError`).
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
  const finalGoal = finalGoalOf(progress);
  const [draft, setDraft] = useState(finalGoal === null ? "" : formatMoneyDraft(String(finalGoal)));
  const [error, setError] = useState<string | undefined>();
  const floor = nextGoalFloor(progress, valuation);
  const title = "목표 금액";

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
            {GROWTH_HINT} 목표에 닿으면 열매가 열려요.{" "}
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
            {finalGoal !== null && (
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
 * 씨앗 심기 시트 — 식물 종류, 식물 이름(선택), 목표(필수, 수확까지의 최종 목표, 하한 `nextGoalError`), 목표를 이루면 하고
 * 싶은 일(선택). 목표 없는 씨앗일 때만 연다 (빈 화분, 수확 뒤 다시 심기 — 새 식물이라 이름은 비어 있다).
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
  onSave: (input: {
    plantKind: PlantKind;
    plantName: string;
    wish: string;
    goalAmount: number;
  }) => void;
}) {
  const [kind, setKind] = useState<PlantKind>(initialKind);
  const [plantName, setPlantName] = useState("");
  const [wish, setWish] = useState(initialWish);
  const [goalDraft, setGoalDraft] = useState("");
  const [goalError, setGoalError] = useState<string | undefined>();
  const invalid = wishError(wish) !== null || plantNameError(plantName) !== null;
  const floor = nextGoalFloor(progress, valuation);

  const plant = () => {
    const goalAmount = goalDraft.trim() === "" ? 0 : parseNumericString(goalDraft);
    const error = nextGoalError(progress, goalAmount, valuation);
    if (error) {
      setGoalError(NEXT_GOAL_ERROR_MESSAGES[error](floor));
      return;
    }
    onSave({ plantKind: kind, plantName: plantName.trim(), wish: wish.trim(), goalAmount });
    onOpenChange(false);
  };

  return (
    <BottomSheetRoot open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent title={title} showHandle>
        <BottomSheetBody>
          <p className="t4-regular text-fg-neutral-subtle pb-x3">
            {description ?? "목표에 닿으면 열매를 수확해 바구니에 담아요."}
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
            <TextField
              label="식물 이름"
              value={plantName}
              onValueChange={({ value }) => setPlantName(value)}
              description="비워 둬도 돼요"
              maxGraphemeCount={PLANT_NAME_MAX_LENGTH}
              invalid={plantNameError(plantName) !== null}
            >
              <TextFieldInput placeholder="예: 몽글이" maxLength={PLANT_NAME_MAX_LENGTH} />
            </TextField>
          </div>
          <div className="pb-x3">
            <MoneyField
              label="목표 금액"
              ariaLabel="목표 금액"
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
                  ? `${numberToKorean(floor)} 이상 (지금보다 10% 이상). ${GROWTH_HINT}`
                  : GROWTH_HINT}
            </p>
          </div>
          <TextField
            label="이루면 하고 싶은 일"
            value={wish}
            onValueChange={({ value }) => setWish(value)}
            description="비워 둬도 돼요. 나중에 고칠 수 있어요"
            maxGraphemeCount={WISH_MAX_LENGTH}
            invalid={wishError(wish) !== null}
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

/**
 * 소원 고치기 시트 — 지금 소원을 고치고(비우면 지운 것), 그 아래 고친 이력을 최근이 앞으로 보여 준다.
 * 이력이 생기기 전에 정한 소원은 날짜 대신 "처음".
 */
export function EditPlantWishSheet({
  open,
  onOpenChange,
  progress,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  progress: Pick<PlantProgress, "wish" | "wishHistory">;
  onSave: (wish: string) => void;
}) {
  const [wish, setWish] = useState(progress.wish);
  const invalid = wishError(wish) !== null;
  const history = wishHistoryNewestFirst(progress);

  const save = () => {
    onSave(wish.trim());
    onOpenChange(false);
  };

  return (
    <BottomSheetRoot open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent title="이루면 하고 싶은 일" showHandle>
        <BottomSheetBody>
          <TextField
            value={wish}
            onValueChange={({ value }) => setWish(value)}
            description="고치면 이력에 남아요"
            maxGraphemeCount={WISH_MAX_LENGTH}
            invalid={invalid}
          >
            <TextFieldInput
              aria-label="이루면 하고 싶은 일"
              placeholder="예: 부모님과 제주 여행"
              maxLength={WISH_MAX_LENGTH}
              autoFocus
            />
          </TextField>
          {history.length > 0 && (
            <section className="pt-x5 pb-x2">
              <h3 className="t4-bold pb-x2">고친 이력</h3>
              <ul className="flex flex-col gap-x2">
                {history.map((entry, i) => (
                  <li
                    // 같은 소원·날짜가 겹칠 수 있어 순서로 구분한다 (목록은 바뀌지 않는다).
                    // biome-ignore lint/suspicious/noArrayIndexKey: 이력은 읽기 전용 목록
                    key={i}
                    className="t3-regular flex gap-x3"
                  >
                    <span className="text-fg-neutral-subtle shrink-0 tabular-nums">
                      {entry.at === null ? "처음" : kstDay(entry.at)}
                    </span>
                    <span
                      className={`min-w-0 break-words ${entry.wish ? "" : "text-fg-neutral-subtle"}`}
                    >
                      {entry.wish || "지웠어요"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </BottomSheetBody>
        <BottomSheetFooter>
          <ActionButton size="large" className="w-full" disabled={invalid} onClick={save}>
            저장
          </ActionButton>
        </BottomSheetFooter>
      </BottomSheetContent>
    </BottomSheetRoot>
  );
}
