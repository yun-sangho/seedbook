"use client";

import { useState } from "react";
import {
  RadioSelectBoxItem,
  RadioSelectBoxRadiomark,
  RadioSelectBoxRoot,
} from "@mobile/seed-design/ui/select-box";
import { TextField, TextFieldInput } from "@mobile/seed-design/ui/text-field";
import { findSeedPreset, SEED_PRESET_DISCLAIMER, SEED_PRESETS } from "../types/seed-presets";
import { CUSTOM_SEED_NAME } from "../utils/onboarding-flow";
import { OnboardingStepLayout } from "./onboarding-step-layout";

const CUSTOM = "custom";
const NAME_MAX_LENGTH = 30;

const classSummary = (classes: (typeof SEED_PRESETS)[number]["classes"]) =>
  classes.map((c) => `${c.label} ${c.percent}`).join(" · ");

export interface PotChoice {
  /** 고른 추천 구성. 직접 만들기는 null. */
  presetId: string | null;
  /** 화분(포트폴리오) 이름. 비우면 구성 이름. */
  name: string;
}

/**
 * 화분 고르기: 널리 알려진 구성 카드 또는 직접 만들기, 그리고 화분 이름. 화분 하나가 포트폴리오 하나다 —
 * 종목·비중을 담으면 화분을 만들고, 씨앗(목표)은 그다음에 심는다.
 */
export function PotStep({
  initial,
  onChoose,
  onLater,
}: {
  /** 이전 단계에서 돌아왔을 때 고른 카드·이름 (아직 고르지 않았으면 undefined). */
  initial: PotChoice | undefined;
  onChoose: (choice: PotChoice) => void;
  onLater: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(
    initial === undefined ? null : (initial.presetId ?? CUSTOM)
  );
  const [name, setName] = useState(initial?.name ?? "");
  const presetId = selected === CUSTOM ? null : selected;
  const fallbackName = findSeedPreset(presetId)?.name ?? CUSTOM_SEED_NAME;

  const choose = (value: string) => {
    const previousFallback = findSeedPreset(presetId)?.name ?? CUSTOM_SEED_NAME;
    setSelected(value);
    // 이름을 손대지 않았으면 고른 구성 이름을 따라간다.
    if (name === "" || name === previousFallback) {
      setName(findSeedPreset(value === CUSTOM ? null : value)?.name ?? CUSTOM_SEED_NAME);
    }
  };

  return (
    <OnboardingStepLayout
      step="pot"
      title="어떤 화분을 만들까요?"
      description="화분 하나가 포트폴리오 하나예요. 구성을 고르면 다음 단계에서 종목을 담아요."
      primary={{
        label: "이 화분으로",
        disabled: selected === null,
        onClick: () => onChoose({ presetId, name: name.trim() || fallbackName }),
      }}
      onLater={onLater}
    >
      <p className="t3-regular text-fg-neutral-subtle break-keep">{SEED_PRESET_DISCLAIMER}</p>
      <RadioSelectBoxRoot aria-label="화분 구성" value={selected ?? ""} onValueChange={choose}>
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
      {selected !== null && (
        <TextField
          label="화분 이름"
          value={name}
          onValueChange={({ value }) => setName(value)}
          description={`${NAME_MAX_LENGTH}자까지`}
        >
          <TextFieldInput placeholder={fallbackName} maxLength={NAME_MAX_LENGTH} />
        </TextField>
      )}
    </OnboardingStepLayout>
  );
}
