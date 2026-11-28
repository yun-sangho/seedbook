import { describe, expect, it } from "vitest";
import type { PlantStage } from "../types/types";
import {
  defaultAvatarPlant,
  pickedAvatarPlant,
  resolveAvatar,
  resolveProfileAvatar,
} from "./plant-avatar";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const GONE = "33333333-3333-4333-8333-333333333333";

function plant(portfolioId: string, stage: PlantStage, value: number, season = 1) {
  return {
    portfolioId,
    color: "#111",
    stage,
    value,
    season,
    kind: "tree" as const,
    ripe: false,
    empty: false,
  };
}

describe("defaultAvatarPlant", () => {
  it("picks the most grown plant", () => {
    expect(defaultAvatarPlant([plant(A, 1, 900), plant(B, 2, 100)])?.portfolioId).toBe(B);
  });

  it("picks a later season over a higher stage", () => {
    expect(defaultAvatarPlant([plant(A, 4, 900), plant(B, 0, 100, 2)])?.portfolioId).toBe(B);
  });

  it("picks the larger portfolio among equally grown plants", () => {
    expect(defaultAvatarPlant([plant(A, 2, 100), plant(B, 2, 900)])?.portfolioId).toBe(B);
  });

  it("is null without portfolios", () => {
    expect(defaultAvatarPlant([])).toBeNull();
  });
});

describe("resolveProfileAvatar", () => {
  const plants = [plant(A, 3, 100), plant(B, 1, 900)];

  it("draws the chosen plant", () => {
    expect(resolveProfileAvatar(`plant:${B}|seed:pot-3-mint`, plants)).toEqual({
      kind: "plant",
      portfolioId: B,
      color: "#111",
      stage: 1,
      plantKind: "tree",
      ripe: false,
      empty: false,
      chosen: true,
    });
  });

  it("draws the most grown plant before one is chosen", () => {
    expect(resolveProfileAvatar("seed:pot-3-mint", plants)).toMatchObject({
      kind: "plant",
      portfolioId: A,
      stage: 3,
      chosen: false,
    });
  });

  it("falls back to the default when the chosen portfolio was deleted", () => {
    expect(resolveProfileAvatar(`plant:${GONE}|seed:pot-3-mint`, plants)).toMatchObject({
      portfolioId: A,
      chosen: false,
    });
  });

  it("draws the seed avatar without portfolios", () => {
    expect(resolveProfileAvatar(`plant:${GONE}|seed:pot-3-mint`, [])).toEqual({
      kind: "seed",
      variant: { form: "pot", leaves: 3, color: "mint" },
    });
  });

  it("has no seed before profile setup", () => {
    expect(resolveProfileAvatar(null, [])).toEqual({ kind: "seed", variant: null });
  });
});

describe("resolveAvatar", () => {
  const seed = { form: "pot", leaves: 3, color: "mint" } as const;

  it("follows the chosen plant as it grows", () => {
    const before = resolveAvatar({ seed, plantPortfolioId: B }, [
      plant(A, 3, 100),
      plant(B, 1, 900),
    ]);
    const after = resolveAvatar({ seed, plantPortfolioId: B }, [
      plant(A, 3, 100),
      plant(B, 2, 900),
    ]);

    expect(before).toMatchObject({ portfolioId: B, stage: 1 });
    expect(after).toMatchObject({ portfolioId: B, stage: 2 });
  });

  it("goes back to the most grown plant when auto is picked", () => {
    expect(
      resolveAvatar({ seed, plantPortfolioId: null }, [plant(A, 1, 100), plant(B, 2, 9)])
    ).toMatchObject({
      portfolioId: B,
      chosen: false,
    });
  });
});

describe("pickedAvatarPlant", () => {
  const plants = [plant(A, 1, 100), plant(B, 2, 900)];

  it("is the chosen portfolio's plant", () => {
    expect(pickedAvatarPlant(A, plants)?.portfolioId).toBe(A);
  });

  it("is null (auto) before a plant is chosen", () => {
    expect(pickedAvatarPlant(null, plants)).toBeNull();
  });

  it("is null (auto) when the chosen portfolio is not here", () => {
    expect(pickedAvatarPlant(GONE, plants)).toBeNull();
  });

  it("is null without portfolios", () => {
    expect(pickedAvatarPlant(A, [])).toBeNull();
  });
});
