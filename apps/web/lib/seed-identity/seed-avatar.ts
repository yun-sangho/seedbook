/**
 * 실명·사진 대신 쓰는 씨앗 아바타. 이미지 파일 없이 변형 id 로 SVG 를 그린다.
 * `user.image` 에는 URL 이 아니라 `seed:<변형 id>` 키를 저장한다.
 */

export const SEED_AVATAR_FORMS = ["seed", "sprout", "pot"] as const;
export type SeedAvatarForm = (typeof SEED_AVATAR_FORMS)[number];

export const SEED_AVATAR_LEAF_COUNTS = [1, 2, 3] as const;
export type SeedAvatarLeafCount = (typeof SEED_AVATAR_LEAF_COUNTS)[number];

export interface SeedAvatarColor {
  /** 배경 원. */
  bg: string;
  /** 잎. */
  leaf: string;
  /** 잎맥·하이라이트. */
  vein: string;
}

export const SEED_AVATAR_COLORS = {
  green: { bg: "#E2F4DF", leaf: "#3E9F4C", vein: "#B9E3B5" },
  mint: { bg: "#D9F3EE", leaf: "#1E9C86", vein: "#A8E3D7" },
  sun: { bg: "#FFF1C9", leaf: "#D99A00", vein: "#FFE08A" },
  coral: { bg: "#FFE2DB", leaf: "#E8664F", vein: "#FFC0B3" },
  sky: { bg: "#DCEEFF", leaf: "#3A88D8", vein: "#B5D8FA" },
  lavender: { bg: "#ECE5FF", leaf: "#8466DB", vein: "#D3C6FA" },
  pink: { bg: "#FFE1EE", leaf: "#DB5A94", vein: "#F9BCD7" },
  olive: { bg: "#E8EED9", leaf: "#5C7C30", vein: "#C6D6A4" },
} as const satisfies Record<string, SeedAvatarColor>;
export type SeedAvatarColorId = keyof typeof SEED_AVATAR_COLORS;
export const SEED_AVATAR_COLOR_IDS = Object.keys(SEED_AVATAR_COLORS) as SeedAvatarColorId[];

export interface SeedAvatarVariant {
  form: SeedAvatarForm;
  leaves: SeedAvatarLeafCount;
  color: SeedAvatarColorId;
}

export const SEED_AVATAR_KEY_PREFIX = "seed:";

/** `sprout-2-mint` 같은 변형 id. */
export function seedAvatarId({ form, leaves, color }: SeedAvatarVariant): string {
  return `${form}-${leaves}-${color}`;
}

export function seedAvatarKey(variant: SeedAvatarVariant): string {
  return `${SEED_AVATAR_KEY_PREFIX}${seedAvatarId(variant)}`;
}

/** `seed:<변형 id>` 를 읽는다. 모르는 값(옛 URL, null 등)이면 null. */
export function parseSeedAvatarKey(key: string | null | undefined): SeedAvatarVariant | null {
  if (!key?.startsWith(SEED_AVATAR_KEY_PREFIX)) return null;
  const [form, leaves, color, ...rest] = key.slice(SEED_AVATAR_KEY_PREFIX.length).split("-");
  if (form === undefined || color === undefined || rest.length > 0) return null;
  const leafCount = Number(leaves);
  if (!(SEED_AVATAR_FORMS as readonly string[]).includes(form)) return null;
  if (!(SEED_AVATAR_LEAF_COUNTS as readonly number[]).includes(leafCount)) return null;
  if (!Object.hasOwn(SEED_AVATAR_COLORS, color)) return null;
  return {
    form: form as SeedAvatarForm,
    leaves: leafCount as SeedAvatarLeafCount,
    color: color as SeedAvatarColorId,
  };
}

export const ALL_SEED_AVATAR_VARIANTS: readonly SeedAvatarVariant[] = SEED_AVATAR_FORMS.flatMap(
  (form) =>
    SEED_AVATAR_LEAF_COUNTS.flatMap((leaves) =>
      SEED_AVATAR_COLOR_IDS.map((color) => ({ form, leaves, color }))
    )
);

/** 비어 있지 않은 목록에서 하나를 고른다. `random` 은 [0, 1). */
export function pickRandom<T>(items: readonly T[], random: () => number): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) throw new Error("pickRandom: empty list or random() out of [0, 1)");
  return item;
}

export function randomSeedAvatar(random: () => number = Math.random): SeedAvatarVariant {
  return pickRandom(ALL_SEED_AVATAR_VARIANTS, random);
}
