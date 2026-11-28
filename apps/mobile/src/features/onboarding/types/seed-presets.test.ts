import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SEED_PRESETS } from "./seed-presets";

/** 시드 DB 종목 (`packages/database/seed-data/stocks.json`). */
const SEED_STOCKS = JSON.parse(
  readFileSync(
    resolve(__dirname, "../../../../../../packages/database/seed-data/stocks.json"),
    "utf8"
  )
) as Array<{ market: string; ticker: string; name: string; isActive: boolean }>;

const allExamples = SEED_PRESETS.flatMap((preset) =>
  preset.classes.flatMap((assetClass) =>
    assetClass.examples.map((example) => ({ preset: preset.id, ...example }))
  )
);

describe("SEED_PRESETS", () => {
  it("offers the six widely known portfolios the user picked", () => {
    expect(SEED_PRESETS.map((p) => p.name)).toEqual([
      "주식 7 : 채권 3",
      "6:4 포트폴리오",
      "올웨더",
      "영구 포트폴리오",
      "골든 버터플라이",
      "미국 지수",
    ]);
  });

  it.each(SEED_PRESETS.map((p) => [p.name, p] as const))(
    "%s splits exactly 100% across asset classes",
    (_, preset) => {
      const tenths = preset.classes.reduce((sum, c) => sum + Math.round(c.percent * 10), 0);
      expect(tenths).toBe(1000);
      for (const c of preset.classes) expect(c.percent).toBeGreaterThan(0);
    }
  );

  it.each(SEED_PRESETS.map((p) => [p.name, p] as const))(
    "%s gives at least one example stock for every asset class",
    (_, preset) => {
      for (const c of preset.classes) expect(c.examples.length).toBeGreaterThan(0);
    }
  );

  it.each(allExamples.map((e) => [e.name, e] as const))(
    "example %s is an active stock in the seed DB",
    (_, example) => {
      const stock = SEED_STOCKS.find(
        (s) => s.market === example.market && s.ticker === example.ticker
      );
      expect(stock).toBeDefined();
      expect(stock?.name).toBe(example.name);
      expect(stock?.isActive).toBe(true);
    }
  );

  it("never lists the same stock twice within one portfolio", () => {
    for (const preset of SEED_PRESETS) {
      const keys = preset.classes.flatMap((c) => c.examples.map((e) => `${e.market}:${e.ticker}`));
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
