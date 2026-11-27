import { describe, expect, it } from "vitest";
import { isProfileImageKey, parseProfileImage, profileImageKey } from "./profile-image";

const PORTFOLIO = "11111111-1111-4111-8111-111111111111";
const seed = { form: "pot", leaves: 3, color: "mint" } as const;

describe("parseProfileImage", () => {
  it("reads a seed avatar without a chosen plant", () => {
    expect(parseProfileImage("seed:pot-3-mint")).toEqual({ seed, plantPortfolioId: null });
  });

  it("reads a chosen plant together with the seed avatar", () => {
    expect(parseProfileImage(`plant:${PORTFOLIO}|seed:pot-3-mint`)).toEqual({
      seed,
      plantPortfolioId: PORTFOLIO,
    });
  });

  it.each([null, undefined, "https://k.kakaocdn.net/hong.jpg", `plant:${PORTFOLIO}`])(
    "reads %s as nothing",
    (image) => {
      expect(parseProfileImage(image)).toEqual({ seed: null, plantPortfolioId: null });
    }
  );
});

describe("profileImageKey", () => {
  it("writes the seed key alone when no plant is chosen", () => {
    expect(profileImageKey({ seed, plantPortfolioId: null })).toBe("seed:pot-3-mint");
  });

  it("round-trips a chosen plant", () => {
    const key = profileImageKey({ seed, plantPortfolioId: PORTFOLIO });

    expect(key).toBe(`plant:${PORTFOLIO}|seed:pot-3-mint`);
    expect(isProfileImageKey(key)).toBe(true);
  });
});
