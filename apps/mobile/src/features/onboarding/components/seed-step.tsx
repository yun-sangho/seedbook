"use client";

import { useMemo, useState } from "react";
import { formatMoneyDraft } from "@mobile/components/mobile/input-format";
import { MoneyField } from "@mobile/components/mobile/money-field";
import type { PlantKind } from "@mobile/features/garden/plant-3d/plant-options";
import { INITIAL_PLANT_PROGRESS } from "@mobile/features/portfolio/types/constants";
import {
  NEXT_GOAL_ERROR_MESSAGES,
  nextGoalError,
} from "@mobile/features/portfolio/utils/plant-season";
import { numberToKorean, parseNumericString } from "@mobile/utils/number-format";
import { seedStagePreview } from "../utils/onboarding-flow";
import { OnboardingStepLayout } from "./onboarding-step-layout";

/** 새 화분의 평가 — 아직 연결 계좌가 없어 0원이다 (목표의 하한이 없다). */
const NEW_POT_VALUATION = { value: 0, pricesComplete: true };

/** 입력한 목표 → 금액. 비었으면 null, 규칙에 어긋나면 오류 문구. */
function readGoal(draft: string): { amount: number | null } | { error: string } {
  if (draft.trim() === "") return { amount: null };
  const amount = parseNumericString(draft);
  const invalid = nextGoalError(INITIAL_PLANT_PROGRESS, amount, NEW_POT_VALUATION);
  return invalid ? { error: NEXT_GOAL_ERROR_MESSAGES[invalid](null) } : { amount };
}

/**
 * 씨앗 심기: 화분에 목표 금액 하나를 정한다. 단계(새싹 … 열매)는 금액에 따라 저절로 오르고, 그 금액을
 * 미리 보여 준다. 목표를 미루면 화분은 빈 화분으로 남는다.
 */
export function SeedStep({
  kind,
  initialGoal,
  onBack,
  onPlant,
  onLater,
}: {
  kind: PlantKind;
  initialGoal: number | null;
  onBack: () => void;
  onPlant: (goalAmount: number) => void;
  /** 목표 없이 빈 화분으로 둔다. */
  onLater: () => void;
}) {
  const [goal, setGoal] = useState(
    initialGoal === null ? "" : formatMoneyDraft(String(initialGoal))
  );
  const [goalError, setGoalError] = useState<string | undefined>();
  const read = readGoal(goal);
  const amount = "amount" in read ? read.amount : null;
  const preview = useMemo(
    () => (amount === null ? [] : seedStagePreview(kind, amount)),
    [kind, amount]
  );

  const plant = () => {
    if ("error" in read) {
      setGoalError(read.error);
      return;
    }
    if (read.amount === null) {
      setGoalError("목표 금액을 입력해 주세요");
      return;
    }
    onPlant(read.amount);
  };

  return (
    <OnboardingStepLayout
      step="seed"
      title="목표를 정하고 씨앗을 심어요"
      description="포트폴리오 금액이 목표에 가까워질수록 식물이 자라고, 목표에 닿으면 수확해요."
      onBack={onBack}
      primary={{ label: "씨앗 심기", onClick: plant }}
      onLater={onLater}
      laterLabel="목표는 나중에 (빈 화분으로 두기)"
    >
      <MoneyField
        label="목표 금액"
        value={goal}
        onValueChange={(next) => {
          setGoal(next);
          setGoalError(undefined);
        }}
        placeholder="예: 10,000,000"
        errorMessage={goalError}
        clearable
      />
      {preview.length > 0 && (
        <section aria-label="단계별 금액" className="bg-bg-neutral-weak rounded-r3 p-x4">
          <p className="t3-medium text-fg-neutral-muted pb-x2">
            금액에 따라 단계가 저절로 올라가요
          </p>
          <ul className="flex flex-col gap-x1">
            {preview.map(({ label, amount: stageAmount }, i) => (
              <li
                key={label}
                className={`t4-regular flex justify-between ${
                  i === preview.length - 1 ? "t4-bold text-fg-neutral" : "text-fg-neutral-muted"
                }`}
              >
                <span>{i === preview.length - 1 ? `${label} (수확)` : label}</span>
                <span>{numberToKorean(stageAmount)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </OnboardingStepLayout>
  );
}
