import { describe, expect, it } from "vitest";
import {
  NICKNAME_MAX_LENGTH,
  needsProfileSetup,
  nicknameError,
  normalizeNickname,
  profileImageError,
  setupNicknameDefault,
} from "./profile";

describe("normalizeNickname", () => {
  it("trims and collapses inner whitespace", () => {
    expect(normalizeNickname("  푸른   새싹 ")).toBe("푸른 새싹");
  });
});

describe("nicknameError", () => {
  it("accepts a generated nickname", () => {
    expect(nicknameError("동글동글한 꽃봉오리")).toBeNull();
  });

  it("rejects an empty nickname", () => {
    expect(nicknameError("   ")).toBe("empty");
  });

  it("rejects a single character", () => {
    expect(nicknameError("콩")).toBe("too-short");
  });

  it("accepts exactly the max length", () => {
    expect(nicknameError("가".repeat(NICKNAME_MAX_LENGTH))).toBeNull();
  });

  it("rejects one character over the max length", () => {
    expect(nicknameError("가".repeat(NICKNAME_MAX_LENGTH + 1))).toBe("too-long");
  });

  it("counts an emoji as one character", () => {
    expect(nicknameError(`${"가".repeat(NICKNAME_MAX_LENGTH - 1)}🌱`)).toBeNull();
  });

  it("rejects names posing as the operator, ignoring spaces and case", () => {
    expect(nicknameError("Seed Book")).toBe("banned");
    expect(nicknameError("운영 자")).toBe("banned");
  });

  it("rejects profanity inside a longer nickname", () => {
    expect(nicknameError("푸른씨발새싹")).toBe("banned");
  });
});

describe("profileImageError", () => {
  it("accepts a seed avatar key", () => {
    expect(profileImageError("seed:pot-3-mint")).toBeNull();
  });

  it("accepts null (no avatar)", () => {
    expect(profileImageError(null)).toBeNull();
  });

  it("rejects a photo URL", () => {
    expect(profileImageError("https://k.kakaocdn.net/hong.jpg")).toBe("invalid");
  });

  it("rejects an unknown variant", () => {
    expect(profileImageError("seed:tree-9-black")).toBe("invalid");
  });

  it("accepts a chosen plant that keeps the seed avatar", () => {
    expect(
      profileImageError("plant:11111111-1111-4111-8111-111111111111|seed:pot-3-mint")
    ).toBeNull();
  });

  it.each([
    ["a plant without its seed", "plant:11111111-1111-4111-8111-111111111111"],
    ["a plant id that is not a UUID", "plant:abc|seed:pot-3-mint"],
    ["a plant with a broken seed", "plant:11111111-1111-4111-8111-111111111111|seed:tree-9-black"],
    ["extra parts", "plant:11111111-1111-4111-8111-111111111111|seed:pot-3-mint|x"],
  ])("rejects %s", (_label, image) => {
    expect(profileImageError(image)).toBe("invalid");
  });
});

describe("needsProfileSetup", () => {
  it("is true for a fresh sign-up without an avatar", () => {
    expect(needsProfileSetup({ name: "사용자", image: null })).toBe(true);
  });

  it("is true for an existing user who renamed themselves but has no avatar", () => {
    expect(needsProfileSetup({ name: "홍길동", image: null })).toBe(true);
  });

  it("is false once a seed avatar is set", () => {
    expect(needsProfileSetup({ name: "푸른 새싹", image: "seed:sprout-2-green" })).toBe(false);
  });

  it("is false after choosing a plant as the avatar", () => {
    expect(
      needsProfileSetup({
        name: "푸른 새싹",
        image: "plant:11111111-1111-4111-8111-111111111111|seed:sprout-2-green",
      })
    ).toBe(false);
  });
});

describe("setupNicknameDefault", () => {
  const generate = () => "푸른 새싹";

  it("draws a nickname for the default name", () => {
    expect(setupNicknameDefault("사용자", generate)).toBe("푸른 새싹");
  });

  it("draws a nickname when there is no name", () => {
    expect(setupNicknameDefault(null, generate)).toBe("푸른 새싹");
  });

  it("keeps a name the user already chose", () => {
    expect(setupNicknameDefault("주식하는 곰", generate)).toBe("주식하는 곰");
  });
});
