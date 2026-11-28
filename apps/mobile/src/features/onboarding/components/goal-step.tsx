"use client";

import { useState } from "react";
import { formatMoneyDraft } from "@mobile/components/mobile/input-format";
import { MoneyField } from "@mobile/components/mobile/money-field";
import { INITIAL_PLANT_PROGRESS } from "@mobile/features/portfolio/types/constants";
import {
  PLANT_GOAL_ERROR_MESSAGES,
  plantGoalError,
} from "@mobile/features/portfolio/utils/portfolio-plant";
import { TextField, TextFieldInput } from "@mobile/seed-design/ui/text-field";
import { parseNumericString } from "@mobile/utils/number-format";
import { OnboardingStepLayout } from "./onboarding-step-layout";

const NAME_MAX_LENGTH = 30;

export interface SeedBasics {
  name: string;
  /** 첫 목표 금액 (원). 비워 두면 null — 정원에서 나중에 정한다. */
  goalAmount: number | null;
}

/** 입력한 목표 → 금액. 비었으면 null, 규칙에 어긋나면 오류 문구. */
function readGoal(draft: string): { amount: number | null } | { error: string } {
  if (draft.trim() === "") return { amount: null };
  const amount = parseNumericString(draft);
  const invalid = plantGoalError(INITIAL_PLANT_PROGRESS, amount);
  return invalid ? { error: PLANT_GOAL_ERROR_MESSAGES[invalid] } : { amount };
}

/** 이름(카드 이름으로 미리 채움) + 첫 목표 금액. */
export function GoalStep({
  initial,
  fallbackName,
  onBack,
  onNext,
  onLater,
}: {
  initial: SeedBasics;
  /** 이름을 비웠을 때 쓸 이름 (카드 이름). */
  fallbackName: string;
  onBack: () => void;
  onNext: (basics: SeedBasics) => void;
  /** 지금 값(목표가 올바르지 않으면 목표 없이)으로 씨앗을 심고 건너뛴다. */
  onLater: (basics: SeedBasics) => void;
}) {
  const [name, setName] = useState(initial.name);
  const [goal, setGoal] = useState(
    initial.goalAmount === null ? "" : formatMoneyDraft(String(initial.goalAmount))
  );
  const [goalError, setGoalError] = useState<string | undefined>();

  const finalName = () => name.trim() || fallbackName;

  const next = () => {
    const read = readGoal(goal);
    if ("error" in read) {
      setGoalError(read.error);
      return;
    }
    onNext({ name: finalName(), goalAmount: read.amount });
  };

  const later = () => {
    const read = readGoal(goal);
    onLater({ name: finalName(), goalAmount: "error" in read ? null : read.amount });
  };

  return (
    <OnboardingStepLayout
      progress={3}
      title="씨앗에 이름과 첫 목표를 정해 주세요"
      description="포트폴리오 금액이 목표에 닿으면 새싹이 터요."
      onBack={onBack}
      primary={{ label: "다음", onClick: next }}
      onLater={later}
    >
      <TextField
        label="이름"
        value={name}
        onValueChange={({ value }) => setName(value)}
        description={`${NAME_MAX_LENGTH}자까지`}
      >
        <TextFieldInput placeholder={fallbackName} maxLength={NAME_MAX_LENGTH} />
      </TextField>
      <div className="flex flex-col gap-x2">
        <MoneyField
          label="첫 목표 금액"
          value={goal}
          onValueChange={(next) => {
            setGoal(next);
            setGoalError(undefined);
          }}
          placeholder="예: 10,000,000"
          errorMessage={goalError}
          clearable
        />
        <p className="t3-regular text-fg-neutral-subtle break-keep">
          비워 두면 정원에서 나중에 정할 수 있어요.
        </p>
      </div>
    </OnboardingStepLayout>
  );
}
