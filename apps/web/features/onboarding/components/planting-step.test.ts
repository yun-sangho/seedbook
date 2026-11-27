import { kindForPortfolio, potForPortfolio } from "@web/features/garden/utils/garden-home";
import { describe, expect, it } from "vitest";
import { seedSlotFor } from "./planting-step";

describe("seedSlotFor", () => {
  it("plants the seed with the portfolio's own pot and kind, as in the home garden", () => {
    const { options } = seedSlotFor("portfolio-1");
    expect(options.stage).toBe("seed");
    expect(options.pot).toBe(potForPortfolio("portfolio-1"));
    expect(options.kind).toBe(kindForPortfolio("portfolio-1"));
  });

  it("falls back to a plain tree seed before the portfolio exists", () => {
    expect(seedSlotFor(null).options).toMatchObject({ kind: "tree", pot: "terracotta" });
  });
});
