import { describe, expect, it } from "vitest";
import { parsePortfolioFields } from "./portfolio-record";

const accountId = "11111111-1111-4111-8111-111111111111";
const valid = {
  name: "안정형",
  color: "#111111",
  note: "",
  accountIds: [accountId],
  driftMode: "relative",
  driftThresholdPercent: 5,
  allocations: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      market: "KOSPI",
      ticker: "005930",
      name: "삼성전자",
      currency: "KRW",
      targetPercent: 12.5,
    },
  ],
};

describe("parsePortfolioFields", () => {
  it("accepts a well-formed portfolio", () => {
    expect(parsePortfolioFields(valid)).toEqual(valid);
  });

  it("ignores client timestamps — the server keeps its own", () => {
    const parsed = parsePortfolioFields({
      ...valid,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });

    expect(parsed).toEqual(valid);
  });

  it("removes repeated account ids", () => {
    expect(
      parsePortfolioFields({ ...valid, accountIds: [accountId, accountId] })?.accountIds
    ).toEqual([accountId]);
  });

  it("fills a missing note, account list and allocation list", () => {
    const { note: _n, accountIds: _a, allocations: _l, ...rest } = valid;

    expect(parsePortfolioFields(rest)).toEqual({
      ...rest,
      note: "",
      accountIds: [],
      allocations: [],
    });
  });

  it("rejects an account id that is not a UUID", () => {
    expect(parsePortfolioFields({ ...valid, accountIds: ["acc-1"] })).toBeNull();
  });

  it("rejects an allocation without a numeric target", () => {
    const allocations = [{ ...valid.allocations[0]!, targetPercent: "10" }];

    expect(parsePortfolioFields({ ...valid, allocations })).toBeNull();
  });

  it("rejects a negative drift threshold", () => {
    expect(parsePortfolioFields({ ...valid, driftThresholdPercent: -1 })).toBeNull();
  });

  it("reads a missing drift mode as the legacy %p mode (older clients)", () => {
    const { driftMode: _m, ...rest } = valid;

    expect(parsePortfolioFields(rest)?.driftMode).toBe("absolute");
  });

  it("rejects an unknown drift mode", () => {
    expect(parsePortfolioFields({ ...valid, driftMode: "ratio" })).toBeNull();
  });
});
