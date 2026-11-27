import { type ProfileImage, parseProfileImage } from "@web/lib/seed-identity/profile-image";
import type { SeedAvatarVariant } from "@web/lib/seed-identity/seed-avatar";
import type { PlantStage } from "../types/types";
import type { PortfolioPlantView } from "./portfolio-plant-view";

type AvatarPlant = Pick<
  PortfolioPlantView,
  "portfolioId" | "color" | "stage" | "drooping" | "value"
>;

/** 프로필 아바타로 그릴 것. */
export type ProfileAvatar =
  | {
      kind: "plant";
      portfolioId: string;
      color: string;
      stage: PlantStage;
      drooping: boolean;
      /** 사용자가 고른 식물인지 (false 면 기본값 — 가장 크게 자란 식물). */
      chosen: boolean;
    }
  | {
      kind: "seed";
      /** 씨앗 아바타. 가입 단계 전이라 없으면 null (기본 아이콘). */
      variant: SeedAvatarVariant | null;
    };

/** 기본 아바타 식물: 가장 크게 자란 식물, 단계가 같으면 금액이 큰 포트폴리오. 없으면 null. */
export function defaultAvatarPlant<T extends AvatarPlant>(plants: readonly T[]): T | null {
  let best: T | null = null;
  for (const plant of plants) {
    if (
      best === null ||
      plant.stage > best.stage ||
      (plant.stage === best.stage && plant.value > best.value)
    ) {
      best = plant;
    }
  }
  return best;
}

/**
 * `user.image` 와 포트폴리오 식물들 → 그릴 아바타. 고른 식물의 포트폴리오가 없어졌으면 기본값으로,
 * 포트폴리오가 하나도 없으면 씨앗 아바타로 돌아간다.
 */
export function resolveProfileAvatar(
  image: string | null | undefined,
  plants: readonly AvatarPlant[]
): ProfileAvatar {
  return resolveAvatar(parseProfileImage(image), plants);
}

/** `resolveProfileAvatar` 의 파싱한 값 버전 (프로필 편집 화면의 아직 저장하지 않은 선택). */
export function resolveAvatar(
  { seed, plantPortfolioId }: ProfileImage,
  plants: readonly AvatarPlant[]
): ProfileAvatar {
  const chosen = pickedAvatarPlant(plantPortfolioId, plants);
  const plant = chosen ?? defaultAvatarPlant(plants);
  if (!plant) return { kind: "seed", variant: seed };
  return {
    kind: "plant",
    portfolioId: plant.portfolioId,
    color: plant.color,
    stage: plant.stage,
    drooping: plant.drooping,
    chosen: chosen !== null,
  };
}

/**
 * 아바타로 고른 식물. 고르지 않았거나 그 포트폴리오가 없으면(삭제, 다른 기기의 local 포트폴리오) null —
 * 아바타 고르기에서 "자동" 이 선택된다.
 */
export function pickedAvatarPlant<T extends Pick<AvatarPlant, "portfolioId">>(
  plantPortfolioId: string | null,
  plants: readonly T[]
): T | null {
  if (plantPortfolioId === null) return null;
  return plants.find((p) => p.portfolioId === plantPortfolioId) ?? null;
}
