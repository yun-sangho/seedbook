import type { Stock } from "@web/features/investments/types/stock";
import { describe, expect, it } from "vitest";
import {
  addSeedStock,
  CUSTOM_SEED_NAME,
  initialOnboardingStep,
  nextOnboardingStep,
  parseOnboardingProgress,
  parsePercentDraft,
  removeSeedStock,
  seedAllocations,
  seedDraftFor,
  seedStocksIssue,
  setSeedGroupPercent,
  skipOnboardingStep,
  splitPercentEvenly,
} from "./onboarding-flow";

const stock = (ticker: string, name = ticker): Stock => ({
  market: "KOSPI",
  ticker,
  name,
  currency: "KRW",
});

describe("onboarding steps", () => {
  it("goes nickname → seed → goal → stocks → planting → storage → done", () => {
    const visited: string[] = [];
    let step: ReturnType<typeof nextOnboardingStep> = "nickname";
    while (step !== "done") {
      visited.push(step);
      step = nextOnboardingStep(step);
    }
    expect(visited).toEqual(["nickname", "seed", "goal", "stocks", "planting", "storage"]);
  });

  it("skipping the nickname still moves on to picking a seed", () => {
    expect(skipOnboardingStep("nickname")).toBe("seed");
  });

  it.each(["seed", "goal", "stocks", "planting"] as const)(
    "skipping %s jumps to choosing storage (the seed stays a seed)",
    (step) => {
      expect(skipOnboardingStep(step)).toBe("storage");
    }
  );

  it("skipping storage finishes onboarding", () => {
    expect(skipOnboardingStep("storage")).toBe("done");
  });
});

describe("initialOnboardingStep", () => {
  it("starts with the nickname when the profile is not set", () => {
    expect(initialOnboardingStep({ needsProfile: true, progress: null, portfolioIds: [] })).toBe(
      "nickname"
    );
  });

  it("starts with picking a seed when the profile is set and nothing was saved", () => {
    expect(initialOnboardingStep({ needsProfile: false, progress: null, portfolioIds: [] })).toBe(
      "seed"
    );
  });

  it("resumes the saved step for the seed this flow planted", () => {
    expect(
      initialOnboardingStep({
        needsProfile: false,
        progress: { step: "stocks", portfolioId: "p-1", presetId: "us-index" },
        portfolioIds: ["p-1"],
      })
    ).toBe("stocks");
  });

  it("starts over at the seed when the saved portfolio is gone", () => {
    expect(
      initialOnboardingStep({
        needsProfile: false,
        progress: { step: "stocks", portfolioId: "p-1", presetId: null },
        portfolioIds: [],
      })
    ).toBe("seed");
  });

  it("resumes storage even without a portfolio (seed was skipped)", () => {
    expect(
      initialOnboardingStep({
        needsProfile: false,
        progress: { step: "storage", portfolioId: null, presetId: null },
        portfolioIds: [],
      })
    ).toBe("storage");
  });
});

describe("parseOnboardingProgress", () => {
  it("reads saved progress", () => {
    const saved = { step: "planting", portfolioId: "p-1", presetId: "permanent" };
    expect(parseOnboardingProgress(JSON.stringify(saved))).toEqual(saved);
  });

  it.each([
    ["nothing", null],
    ["broken json", "{"],
    ["an unknown step", JSON.stringify({ step: "goal", portfolioId: "p", presetId: null })],
    ["stocks without a portfolio", JSON.stringify({ step: "stocks", portfolioId: null })],
  ])("ignores %s", (_, raw) => {
    expect(parseOnboardingProgress(raw)).toBeNull();
  });
});

describe("seedDraftFor", () => {
  it("prefills the card name and asset classes with no stocks picked", () => {
    const draft = seedDraftFor("all-weather");
    expect(draft.name).toBe("올웨더");
    expect(draft.groups.map((g) => [g.label, g.percent, g.stocks.length])).toEqual([
      ["주식", 30, 0],
      ["장기채", 40, 0],
      ["중기채", 15, 0],
      ["금", 7.5, 0],
      ["원자재", 7.5, 0],
    ]);
  });

  it("starts a self-made seed empty", () => {
    const draft = seedDraftFor(null);
    expect(draft).toMatchObject({ presetId: null, name: CUSTOM_SEED_NAME, groups: [] });
  });
});

describe("splitPercentEvenly", () => {
  it("splits in 0.1% steps that add back up exactly", () => {
    expect(splitPercentEvenly(100, 3)).toEqual([33.4, 33.3, 33.3]);
    expect(splitPercentEvenly(7.5, 2)).toEqual([3.8, 3.7]);
    expect(splitPercentEvenly(70, 2)).toEqual([35, 35]);
  });

  it("returns nothing for zero parts", () => {
    expect(splitPercentEvenly(50, 0)).toEqual([]);
  });
});

describe("picking stocks", () => {
  it("adds a stock to an asset class without changing the class weight", () => {
    const draft = addSeedStock(seedDraftFor("stocks-70-bonds-30"), "stocks", stock("069500"));
    expect(draft.groups[0]).toMatchObject({ percent: 70, stocks: [stock("069500")] });
  });

  it("ignores a stock already picked anywhere in the portfolio", () => {
    const once = addSeedStock(seedDraftFor("stocks-70-bonds-30"), "stocks", stock("069500"));
    const twice = addSeedStock(once, "bonds", stock("069500"));
    expect(twice).toBe(once);
  });

  it("removes a picked stock", () => {
    const added = addSeedStock(seedDraftFor("us-index"), "sp500", stock("360750"));
    const removed = removeSeedStock(added, "sp500", stock("360750"));
    expect(removed.groups[0]?.stocks).toEqual([]);
  });

  it("gives each self-picked stock its own even share", () => {
    let draft = seedDraftFor(null);
    draft = addSeedStock(draft, null, stock("A"));
    draft = addSeedStock(draft, null, stock("B"));
    draft = addSeedStock(draft, null, stock("C"));
    expect(draft.groups.map((g) => [g.label, g.percent])).toEqual([
      ["A", 33.4],
      ["B", 33.3],
      ["C", 33.3],
    ]);
    draft = removeSeedStock(draft, draft.groups[0]?.id ?? "", stock("A"));
    expect(draft.groups.map((g) => [g.label, g.percent])).toEqual([
      ["B", 50],
      ["C", 50],
    ]);
  });

  it("changes one class weight, clamped to 0–100 with 0.1 steps", () => {
    const draft = seedDraftFor("stocks-70-bonds-30");
    expect(setSeedGroupPercent(draft, "stocks", 65.04).groups[0]?.percent).toBe(65);
    expect(setSeedGroupPercent(draft, "stocks", 140).groups[0]?.percent).toBe(100);
    expect(setSeedGroupPercent(draft, "stocks", -3).groups[0]?.percent).toBe(0);
  });
});

describe("parsePercentDraft", () => {
  it.each([
    ["30", 30],
    ["7.5", 7.5],
    [" 12.25 ", 12.3],
    ["", 0],
  ])("reads %j as %s", (text, value) => {
    expect(parsePercentDraft(text)).toBe(value);
  });

  it("rejects non-numbers", () => {
    expect(parsePercentDraft("abc")).toBeNull();
  });
});

describe("seedStocksIssue", () => {
  const filled = () => {
    let draft = seedDraftFor("stocks-70-bonds-30");
    draft = addSeedStock(draft, "stocks", stock("069500"));
    draft = addSeedStock(draft, "bonds", stock("114260"));
    return draft;
  };

  it("is ready when every weighted class has a stock and weights add up to 100%", () => {
    expect(seedStocksIssue(filled())).toEqual({ issue: null, totalPercent: 100 });
  });

  it("asks for a stock in a weighted class that has none", () => {
    const draft = addSeedStock(seedDraftFor("stocks-70-bonds-30"), "stocks", stock("069500"));
    expect(seedStocksIssue(draft)).toMatchObject({ issue: "group-without-stock", group: "채권" });
  });

  it("allows an empty class whose weight was set to 0%", () => {
    let draft = addSeedStock(seedDraftFor("stocks-70-bonds-30"), "stocks", stock("069500"));
    draft = setSeedGroupPercent(draft, "bonds", 0);
    draft = setSeedGroupPercent(draft, "stocks", 100);
    expect(seedStocksIssue(draft).issue).toBeNull();
  });

  it("asks to fix weights that do not add up to 100%", () => {
    const draft = setSeedGroupPercent(filled(), "bonds", 20);
    expect(seedStocksIssue(draft)).toEqual({ issue: "total-not-100", totalPercent: 90 });
  });

  it("asks for at least one stock in a self-made seed", () => {
    expect(seedStocksIssue(seedDraftFor(null))).toEqual({ issue: "empty", totalPercent: 0 });
  });
});

describe("seedAllocations", () => {
  it("splits each class weight evenly across its stocks, summing to 100%", () => {
    let draft = seedDraftFor("stocks-70-bonds-30");
    draft = addSeedStock(draft, "stocks", stock("069500", "KODEX 200"));
    draft = addSeedStock(draft, "stocks", stock("360750", "TIGER 미국S&P500"));
    draft = addSeedStock(draft, "stocks", stock("251350", "KODEX MSCI선진국"));
    draft = addSeedStock(draft, "bonds", stock("114260", "KODEX 국고채3년"));
    const allocations = seedAllocations(draft);
    expect(allocations.map((a) => [a.ticker, a.targetPercent])).toEqual([
      ["069500", 23.4],
      ["360750", 23.3],
      ["251350", 23.3],
      ["114260", 30],
    ]);
    expect(allocations.reduce((sum, a) => sum + Math.round(a.targetPercent * 10), 0)).toBe(1000);
    expect(allocations[0]).toEqual({
      market: "KOSPI",
      ticker: "069500",
      name: "KODEX 200",
      currency: "KRW",
      targetPercent: 23.4,
    });
  });

  it("leaves out classes set to 0%", () => {
    let draft = seedDraftFor("stocks-70-bonds-30");
    draft = addSeedStock(draft, "stocks", stock("069500"));
    draft = addSeedStock(draft, "bonds", stock("114260"));
    draft = setSeedGroupPercent(draft, "bonds", 0);
    expect(seedAllocations(draft).map((a) => a.ticker)).toEqual(["069500"]);
  });
});
