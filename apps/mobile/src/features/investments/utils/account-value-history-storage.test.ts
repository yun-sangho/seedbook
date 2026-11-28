import { __resetAccountForTests, activateAccount } from "@mobile/lib/account-storage";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountValueSnapshot, DailyClose, HoldingsByAccount } from "./account-value-history";
import {
  downloadAccountSnapshots,
  fetchDailyCloses,
  fillMissingSnapshots,
  kstToday,
  readAccountSnapshots,
  readHoldingsHistory,
  recordHoldings,
  uploadAccountSnapshots,
} from "./account-value-history-storage";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";

const holdings = (quantity: number, cash = 0): HoldingsByAccount => ({
  [ACCOUNT]: { holdings: [{ market: "KOSPI", ticker: "005930", quantity }], cash: [cash] },
});

function snapshot(date: string, totalValue: number): AccountValueSnapshot {
  return {
    accountId: ACCOUNT,
    date,
    stockValue: totalValue,
    cashValue: 0,
    totalValue,
    holdingCount: 1,
    missingPriceCount: 0,
    oldestPriceDate: date,
  };
}

function writeSnapshots(snapshots: AccountValueSnapshot[]) {
  localStorage.setItem(
    "account-snapshot-storage",
    JSON.stringify({ state: { snapshots }, version: 1 })
  );
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(async () => {
  localStorage.clear();
  __resetAccountForTests();
  await activateAccount("user-1");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("kstToday", () => {
  it("uses the Korean calendar day", () => {
    expect(kstToday(new Date("2026-11-26T15:30:00Z"))).toBe("2026-11-27");
  });
});

describe("recordHoldings", () => {
  it("keeps one entry per day and skips unchanged holdings", async () => {
    expect(await recordHoldings(holdings(1), "2026-11-24")).toBe(true);
    expect(await recordHoldings(holdings(1), "2026-11-25")).toBe(false);
    expect(await recordHoldings(holdings(2), "2026-11-25")).toBe(true);
    expect(await recordHoldings(holdings(3), "2026-11-25")).toBe(true);

    expect(await readHoldingsHistory()).toEqual([
      { date: "2026-11-24", accounts: holdings(1) },
      { date: "2026-11-25", accounts: holdings(3) },
    ]);
  });
});

describe("fillMissingSnapshots", () => {
  const closes = new Map<string, DailyClose[]>([
    ["KOSPI:005930", [{ date: "2026-11-23", close: 100 }]],
  ]);

  it("values the missing weekdays up to yesterday and keeps what is already recorded", async () => {
    await recordHoldings(holdings(1), "2026-11-20");
    await recordHoldings(holdings(2), "2026-11-24");
    writeSnapshots([snapshot("2026-11-20", 7)]);
    const fetchCloses = vi.fn(async () => closes);

    const added = await fillMissingSnapshots({ today: "2026-11-26", fetchCloses });

    expect(fetchCloses).toHaveBeenCalledWith([{ market: "KOSPI", ticker: "005930" }], {
      from: "2026-11-21",
      to: "2026-11-25",
    });
    expect(added).toBe(3);
    expect((await readAccountSnapshots()).map((s) => [s.date, s.totalValue])).toEqual([
      ["2026-11-20", 7],
      ["2026-11-23", 100],
      ["2026-11-24", 200],
      ["2026-11-25", 200],
    ]);
  });

  it("does not ask for prices when nothing is missing", async () => {
    await recordHoldings(holdings(1), "2026-11-26");
    const fetchCloses = vi.fn(async () => closes);

    expect(await fillMissingSnapshots({ today: "2026-11-26", fetchCloses })).toBe(0);
    expect(fetchCloses).not.toHaveBeenCalled();
  });

  it("does not ask for prices for cash-only accounts", async () => {
    await recordHoldings({ [ACCOUNT]: { holdings: [], cash: [500] } }, "2026-11-24");
    const fetchCloses = vi.fn(async () => closes);

    expect(await fillMissingSnapshots({ today: "2026-11-26", fetchCloses })).toBe(2);
    expect(fetchCloses).not.toHaveBeenCalled();
  });

  it("writes nothing when the prices cannot be loaded, so the next launch retries", async () => {
    await recordHoldings(holdings(1), "2026-11-20");
    const fetchCloses = vi.fn(async () => {
      throw new Error("offline");
    });

    await expect(fillMissingSnapshots({ today: "2026-11-26", fetchCloses })).rejects.toThrow(
      "offline"
    );
    expect(await readAccountSnapshots()).toEqual([]);
  });
});

describe("fetchDailyCloses", () => {
  it("splits a long absence into several requests and joins the closes in date order", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const { from } = JSON.parse(String(init?.body)) as { from: string };
      // 두 번째 요청은 범위 전 마지막 종가(첫 요청의 마지막 날)를 다시 담는다.
      const closes =
        from === "2026-01-01"
          ? [{ date: "2026-06-29", close: 1 }]
          : [
              { date: "2026-06-29", close: 1 },
              { date: "2026-11-25", close: 2 },
            ];
      return json({ prices: [{ market: "KOSPI", ticker: "005930", closes }] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchDailyCloses([{ market: "KOSPI", ticker: "005930" }], {
      from: "2026-01-01",
      to: "2026-11-25",
    });

    expect(fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)))).toEqual([
      { items: [{ market: "KOSPI", ticker: "005930" }], from: "2026-01-01", to: "2026-06-29" },
      { items: [{ market: "KOSPI", ticker: "005930" }], from: "2026-06-30", to: "2026-11-25" },
    ]);
    expect(result.get("KOSPI:005930")).toEqual([
      { date: "2026-06-29", close: 1 },
      { date: "2026-11-25", close: 2 },
    ]);
  });

  it("throws when the server refuses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ error: "unauthorized" }, 401))
    );

    await expect(
      fetchDailyCloses([{ market: "KOSPI", ticker: "005930" }], {
        from: "2026-11-20",
        to: "2026-11-25",
      })
    ).rejects.toThrow("401");
  });
});

describe("mode switch", () => {
  it("uploads the device snapshots in batches", async () => {
    const many = Array.from({ length: 501 }, (_, i) =>
      snapshot(new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10), i)
    );
    writeSnapshots(many);
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json({ saved: 1 }));
    vi.stubGlobal("fetch", fetchMock);

    await uploadAccountSnapshots();

    const sent = fetchMock.mock.calls.map(
      ([, init]) => (JSON.parse(String(init?.body)) as { snapshots: unknown[] }).snapshots.length
    );
    expect(sent).toEqual([500, 1]);
  });

  it("fails the upload when the server refuses", async () => {
    writeSnapshots([snapshot("2026-11-24", 1)]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({}, 500))
    );

    await expect(uploadAccountSnapshots()).rejects.toThrow("500");
  });

  it("merges the server snapshots into the device, keeping the device's for the same day", async () => {
    writeSnapshots([snapshot("2026-11-24", 1)]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ snapshots: [snapshot("2026-11-23", 9), snapshot("2026-11-24", 9)] }))
    );

    await downloadAccountSnapshots();

    expect((await readAccountSnapshots()).map((s) => [s.date, s.totalValue])).toEqual([
      ["2026-11-23", 9],
      ["2026-11-24", 1],
    ]);
  });
});
