import { describe, expect, it } from "vitest";
import {
  ALL_SEED_AVATAR_VARIANTS,
  parseSeedAvatarKey,
  randomSeedAvatar,
  seedAvatarKey,
} from "./seed-avatar";

describe("seed avatar key", () => {
  it("round-trips every variant", () => {
    for (const variant of ALL_SEED_AVATAR_VARIANTS) {
      expect(parseSeedAvatarKey(seedAvatarKey(variant))).toEqual(variant);
    }
  });

  it("formats as seed:<form>-<leaves>-<color>", () => {
    expect(seedAvatarKey({ form: "sprout", leaves: 2, color: "mint" })).toBe("seed:sprout-2-mint");
  });

  it.each([
    null,
    undefined,
    "",
    "https://example.com/a.png",
    "seed:",
    "seed:sprout-2",
    "seed:sprout-4-mint",
    "seed:tree-2-mint",
    "seed:sprout-2-black",
    "seed:sprout-2-mint-extra",
    "seed:sprout-2-toString",
  ])("rejects %s", (key) => {
    expect(parseSeedAvatarKey(key)).toBeNull();
  });
});

describe("randomSeedAvatar", () => {
  it("covers the first and last variant", () => {
    expect(randomSeedAvatar(() => 0)).toEqual(ALL_SEED_AVATAR_VARIANTS[0]);
    expect(randomSeedAvatar(() => 0.9999)).toEqual(ALL_SEED_AVATAR_VARIANTS.at(-1));
  });

  it("has 72 distinct variants", () => {
    expect(new Set(ALL_SEED_AVATAR_VARIANTS.map(seedAvatarKey)).size).toBe(72);
  });
});
