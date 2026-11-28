import {
  parseSeedAvatarKey,
  type SeedAvatarVariant,
  seedAvatarKey,
} from "@mobile/lib/seed-identity/seed-avatar";

/**
 * `user.image` 키. 실명 사진 대신 쓰는 값이라 두 모양만 받는다.
 *
 *   - `seed:<변형 id>` — 씨앗 아바타 (#74).
 *   - `plant:<포트폴리오 id>|seed:<변형 id>` — 사용자가 아바타로 고른 자기 포트폴리오 식물. 원래 씨앗도
 *     함께 둔다: 포트폴리오가 하나도 없게 되면 그 씨앗으로 돌아간다.
 *
 * 식물을 고르지 않았으면 가장 크게 자란 식물이 기본 아바타다 (`features/portfolio/utils/plant-avatar.ts`).
 */

export const PLANT_AVATAR_KEY_PREFIX = "plant:";
const PLANT_SEED_SEPARATOR = "|";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ProfileImage {
  /** 씨앗 아바타. 모르는 값(옛 사진 URL, null 등)이면 null. */
  seed: SeedAvatarVariant | null;
  /** 아바타로 고른 포트폴리오 식물. 고르지 않았으면 null. */
  plantPortfolioId: string | null;
}

export function parseProfileImage(image: string | null | undefined): ProfileImage {
  if (!image?.startsWith(PLANT_AVATAR_KEY_PREFIX)) {
    return { seed: parseSeedAvatarKey(image), plantPortfolioId: null };
  }
  const [plant, seed, ...rest] = image
    .slice(PLANT_AVATAR_KEY_PREFIX.length)
    .split(PLANT_SEED_SEPARATOR);
  const variant = parseSeedAvatarKey(seed);
  if (plant === undefined || !UUID_RE.test(plant) || !variant || rest.length > 0) {
    return { seed: null, plantPortfolioId: null };
  }
  return { seed: variant, plantPortfolioId: plant.toLowerCase() };
}

export function profileImageKey({
  seed,
  plantPortfolioId,
}: {
  seed: SeedAvatarVariant;
  plantPortfolioId: string | null;
}): string {
  const seedKey = seedAvatarKey(seed);
  return plantPortfolioId === null
    ? seedKey
    : `${PLANT_AVATAR_KEY_PREFIX}${plantPortfolioId}${PLANT_SEED_SEPARATOR}${seedKey}`;
}

/** 위 두 모양 중 하나인지 (대소문자·순서까지 그대로). */
export function isProfileImageKey(image: string): boolean {
  const parsed = parseProfileImage(image);
  return (
    parsed.seed !== null &&
    profileImageKey({ seed: parsed.seed, plantPortfolioId: parsed.plantPortfolioId }) === image
  );
}
