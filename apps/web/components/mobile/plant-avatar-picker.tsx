"use client";

import type { ReactNode } from "react";
import { ProfileAvatarImage } from "@web/components/profile-avatar";
import type { ProfileDraft } from "@web/components/profile-editor";
import { PLANT_STAGE_LABELS, PLANT_STAGES } from "@web/features/garden/plant-3d/plant-options";
import {
  defaultAvatarPlant,
  pickedAvatarPlant,
  resolveAvatar,
} from "@web/features/portfolio/utils/plant-avatar";
import type { PortfolioPlantView } from "@web/features/portfolio/utils/portfolio-plant-view";

const OPTION_AVATAR_SIZE = 56;

/**
 * 프로필 시트의 아바타 고르기: 큰 아바타 + "자동(가장 큰 식물)" 과 내 식물들. 포트폴리오가 있을
 * 때만 보인다 (없으면 씨앗 다시 뽑기). 고른 포트폴리오가 이 기기에 없으면 "자동" 이 선택된다.
 */
export function PlantAvatarPicker({
  draft,
  plants,
  avatarSize,
}: {
  draft: ProfileDraft;
  plants: readonly PortfolioPlantView[];
  avatarSize: number;
}) {
  const current = resolveAvatar(
    { seed: draft.avatar, plantPortfolioId: draft.plantPortfolioId },
    plants
  );
  const picked = pickedAvatarPlant(draft.plantPortfolioId, plants);
  const auto = defaultAvatarPlant(plants);

  return (
    <>
      <ProfileAvatarImage avatar={current} size={avatarSize} />
      <div className="w-full">
        <p id="avatar-picker-label" className="t4-bold text-fg-neutral pb-x2">
          아바타 고르기
        </p>
        <div
          role="radiogroup"
          aria-labelledby="avatar-picker-label"
          className="-mx-x4 flex gap-x3 overflow-x-auto px-x4 pb-x1"
        >
          <PickerOption
            label="자동"
            detail="가장 큰 식물"
            checked={picked === null}
            onSelect={() => draft.choosePlant(null)}
            avatar={auto && <PlantOptionAvatar plant={auto} />}
          />
          {plants.map((plant) => (
            <PickerOption
              key={plant.portfolioId}
              label={plant.name}
              detail={PLANT_STAGE_LABELS[PLANT_STAGES[plant.stage]]}
              checked={picked?.portfolioId === plant.portfolioId}
              onSelect={() => draft.choosePlant(plant.portfolioId)}
              avatar={<PlantOptionAvatar plant={plant} />}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function PlantOptionAvatar({ plant }: { plant: PortfolioPlantView }) {
  return (
    <ProfileAvatarImage
      avatar={{
        kind: "plant",
        portfolioId: plant.portfolioId,
        color: plant.color,
        stage: plant.stage,
        drooping: plant.drooping,
        chosen: false,
      }}
      size={OPTION_AVATAR_SIZE}
    />
  );
}

function PickerOption({
  label,
  detail,
  checked,
  onSelect,
  avatar,
}: {
  label: string;
  detail: string;
  checked: boolean;
  onSelect: () => void;
  avatar: ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: 아바타 그림을 담은 카드형 선택지라 input radio 대신 button 을 쓴다.
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={`${label} · ${detail}`}
      onClick={onSelect}
      className="flex w-[76px] shrink-0 flex-col items-center gap-x1 py-x1"
    >
      <span
        className={`flex rounded-full border-2 p-0.5 ${
          checked ? "border-stroke-brand-solid" : "border-transparent"
        }`}
      >
        {avatar}
      </span>
      <span
        className={`t3-medium w-full truncate text-center ${
          checked ? "text-fg-brand" : "text-fg-neutral"
        }`}
      >
        {label}
      </span>
      <span className="t2-regular text-fg-neutral-subtle w-full truncate text-center">
        {detail}
      </span>
    </button>
  );
}
