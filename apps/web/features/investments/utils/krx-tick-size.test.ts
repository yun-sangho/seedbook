import { describe, expect, it } from "vitest";
import { snapToTick, stepByTick, tickSize } from "./krx-tick-size";

describe("tickSize", () => {
  it("is 5원 for an ETF at or above 2,000원", () => {
    expect(tickSize(13_205, "etf")).toBe(5);
    expect(tickSize(2_000, "etf")).toBe(5);
    expect(tickSize(104_010, "etf")).toBe(5);
  });

  it("is 1원 for an ETF below 2,000원", () => {
    expect(tickSize(1_995, "etf")).toBe(1);
  });

  it("treats an ETN like an ETF", () => {
    expect(tickSize(13_205, "etn")).toBe(5);
  });

  it.each([
    [1_999, 1],
    [2_000, 5],
    [4_995, 5],
    [5_000, 10],
    [19_990, 10],
    [20_000, 50],
    [49_950, 50],
    [50_000, 100],
    [199_900, 100],
    [200_000, 500],
    [499_500, 500],
    [500_000, 1_000],
  ])("follows the KRX stock table: %i원 → %i원", (price, tick) => {
    expect(tickSize(price, "stock")).toBe(tick);
  });

  it("is unknown when the security type is unknown", () => {
    expect(tickSize(13_205, null)).toBeNull();
    expect(tickSize(13_205, undefined)).toBeNull();
  });
});

describe("snapToTick", () => {
  it("rounds to the nearest tick", () => {
    expect(snapToTick(13_203, "etf")).toBe(13_205);
    expect(snapToTick(13_202, "etf")).toBe(13_200);
    expect(snapToTick(70_040, "stock")).toBe(70_000);
    expect(snapToTick(70_060, "stock")).toBe(70_100);
  });

  it("keeps a price already on a tick", () => {
    expect(snapToTick(13_205, "etf")).toBe(13_205);
  });

  it("leaves the price as typed when the type is unknown", () => {
    expect(snapToTick(13_203, null)).toBe(13_203);
  });
});

describe("stepByTick", () => {
  it("moves one tick up or down", () => {
    expect(stepByTick(13_205, 1, "etf")).toBe(13_210);
    expect(stepByTick(13_205, -1, "etf")).toBe(13_200);
  });

  it("uses the smaller tick of the band below when stepping down across a boundary", () => {
    expect(stepByTick(20_000, -1, "stock")).toBe(19_990);
    expect(stepByTick(2_000, -1, "etf")).toBe(1_999);
  });

  it("uses the band's own tick when stepping up across a boundary", () => {
    expect(stepByTick(19_990, 1, "stock")).toBe(20_000);
    expect(stepByTick(20_000, 1, "stock")).toBe(20_050);
  });

  it("snaps an off-tick price before stepping", () => {
    expect(stepByTick(13_203, 1, "etf")).toBe(13_210);
    expect(stepByTick(13_203, -1, "etf")).toBe(13_200);
  });

  it("does not go below one tick", () => {
    expect(stepByTick(1, -1, "stock")).toBe(1);
  });

  it("steps by 1원 when the type is unknown", () => {
    expect(stepByTick(13_203, 1, null)).toBe(13_204);
  });
});
