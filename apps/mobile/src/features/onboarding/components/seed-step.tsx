"use client";

import { useState } from "react";
import { Callout } from "@mobile/seed-design/ui/callout";
import {
  RadioSelectBoxItem,
  RadioSelectBoxRadiomark,
  RadioSelectBoxRoot,
} from "@mobile/seed-design/ui/select-box";
import { SEED_PRESET_DISCLAIMER, SEED_PRESETS } from "../types/seed-presets";
import { OnboardingStepLayout } from "./onboarding-step-layout";

const CUSTOM = "custom";

const classSummary = (classes: (typeof SEED_PRESETS)[number]["classes"]) =>
  classes.map((c) => `${c.label} ${c.percent}`).join(" · ");

/** 첫 씨앗 고르기: 널리 알려진 포트폴리오 카드 또는 직접 만들기. */
export function SeedStep({
  initial,
  onChoose,
  onLater,
}: {
  /** 이전 단계에서 돌아왔을 때 고른 카드 (직접 만들기는 null). */
  initial: string | null | undefined;
  onChoose: (presetId: string | null) => void;
  onLater: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(
    initial === undefined ? null : (initial ?? CUSTOM)
  );

  return (
    <OnboardingStepLayout
      progress={2}
      title="첫 씨앗을 골라 주세요"
      description="씨앗 하나가 포트폴리오 하나예요. 목표 금액에 닿을 때마다 한 단계씩 자라요."
      primary={{
        label: "이 씨앗으로 시작",
        disabled: selected === null,
        onClick: () => onChoose(selected === CUSTOM ? null : selected),
      }}
      onLater={onLater}
    >
      <Callout tone="neutral" description={SEED_PRESET_DISCLAIMER} />
      <RadioSelectBoxRoot
        aria-label="첫 씨앗"
        value={selected ?? ""}
        onValueChange={(value) => setSelected(value)}
      >
        {SEED_PRESETS.map((preset) => (
          <RadioSelectBoxItem
            key={preset.id}
            value={preset.id}
            label={preset.name}
            description={
              <span className="flex flex-col gap-x1">
                <span>{preset.description}</span>
                <span className="t3-medium text-fg-neutral-subtle">
                  {classSummary(preset.classes)} (%)
                </span>
              </span>
            }
            suffix={<RadioSelectBoxRadiomark />}
          />
        ))}
        <RadioSelectBoxItem
          value={CUSTOM}
          label="직접 만들기"
          description="종목과 비중을 처음부터 정해요"
          suffix={<RadioSelectBoxRadiomark />}
        />
      </RadioSelectBoxRoot>
    </OnboardingStepLayout>
  );
}
