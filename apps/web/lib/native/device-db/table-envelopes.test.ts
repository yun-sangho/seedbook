// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { migrateDeviceDatabase } from "./migrations";
import type { SqlDriver } from "./sql-driver";
import {
  clearDeviceTables,
  isTableEnvelopeKey,
  readTableEnvelope,
  writeTableEnvelope,
} from "./table-envelopes";
import { createNodeSqliteDriver } from "./testing/node-sqlite-driver";

const ACCOUNT_A = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_B = "22222222-2222-4222-8222-222222222222";
const HOLDING_A = "33333333-3333-4333-8333-333333333333";
const CASH_A = "44444444-4444-4444-8444-444444444444";
const PORTFOLIO = "55555555-5555-4555-8555-555555555555";
const ALLOCATION = "66666666-6666-4666-8666-666666666666";
const SESSION = "77777777-7777-4777-8777-777777777777";

function account(id: string, name: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    accountName: name,
    accountType: "일반 투자 계좌",
    currency: "KRW",
    initialInvestment: 1_000_000,
    currentValue: 1_200_000,
    note: "",
    color: "#ff0000",
    sellCostPercent: 0.2,
    records: [],
    holdings: [],
    cashItems: [],
    ...extra,
  };
}

function envelope(state: Record<string, unknown>, version: number) {
  return JSON.stringify({ state, version });
}

async function read(driver: SqlDriver, key: string) {
  const raw = await readTableEnvelope(driver, key);
  return raw === null
    ? null
    : (JSON.parse(raw) as { state: Record<string, unknown>; version: number });
}

let driver: SqlDriver;

beforeEach(async () => {
  driver = createNodeSqliteDriver();
  await migrateDeviceDatabase(driver);
});

describe("isTableEnvelopeKey", () => {
  it("covers the asset stores and preferences only", () => {
    expect(isTableEnvelopeKey("investment-storage")).toBe(true);
    expect(isTableEnvelopeKey("portfolio-storage")).toBe(true);
    expect(isTableEnvelopeKey("rebalancing-storage")).toBe(true);
    expect(isTableEnvelopeKey("seedbook.preferences")).toBe(true);
    expect(isTableEnvelopeKey("stock-price-cache")).toBe(false);
  });
});

describe("investment-storage", () => {
  it("returns null when nothing has been saved", async () => {
    expect(await readTableEnvelope(driver, "investment-storage")).toBeNull();
  });

  it("stores accounts, holdings, cash and records in the server's tables", async () => {
    await writeTableEnvelope(
      driver,
      "investment-storage",
      envelope(
        {
          investments: [
            account(ACCOUNT_A, "증권 계좌", {
              records: [{ date: "2026-11-01", initialInvestment: 900_000, currentValue: 950_000 }],
              holdings: [
                {
                  id: HOLDING_A,
                  market: "KRX",
                  ticker: "005930",
                  name: "삼성전자",
                  currency: "KRW",
                  quantity: 10,
                  memo: "",
                },
              ],
              cashItems: [{ id: CASH_A, label: "예수금", amount: 50_000 }],
            }),
          ],
          holdingsSortOption: "evalDesc",
        },
        6
      )
    );

    const accounts = await driver.query(
      "SELECT id, accountName, initialInvestment FROM investment_account"
    );
    const holdings = await driver.query("SELECT ticker, quantity FROM stock_holding");
    const cash = await driver.query("SELECT label, amount FROM cash_item");
    const records = await driver.query("SELECT date, currentValue FROM investment_record");
    expect(accounts).toEqual([
      { id: ACCOUNT_A, accountName: "증권 계좌", initialInvestment: 1_000_000 },
    ]);
    expect(holdings).toEqual([{ ticker: "005930", quantity: 10 }]);
    expect(cash).toEqual([{ label: "예수금", amount: 50_000 }]);
    expect(records).toEqual([{ date: "2026-11-01", currentValue: 950_000 }]);
  });

  it("reads back the same accounts in the saved order", async () => {
    const investments = [
      account(ACCOUNT_B, "두 번째", {
        holdings: [
          {
            id: HOLDING_A,
            market: "KRX",
            ticker: "005930",
            name: "삼성전자",
            currency: "KRW",
            quantity: 3.5,
            memo: "메모",
          },
        ],
        cashItems: [{ id: CASH_A, label: "예수금", amount: 7 }],
        records: [
          { date: "2026-10-01", initialInvestment: 1, currentValue: 2 },
          { date: "2026-11-01", initialInvestment: 3, currentValue: 4 },
        ],
      }),
      account(ACCOUNT_A, "첫 번째"),
    ];
    await writeTableEnvelope(
      driver,
      "investment-storage",
      envelope({ investments, holdingsSortOption: "nameAsc" }, 6)
    );

    const result = await read(driver, "investment-storage");

    expect(result?.version).toBe(4);
    expect(result?.state.holdingsSortOption).toBe("nameAsc");
    expect(result?.state.investments).toEqual([
      {
        ...investments[0],
        // 기록은 최신 날짜가 먼저 (서버 번역기와 같다).
        records: [
          { date: "2026-11-01", initialInvestment: 3, currentValue: 4 },
          { date: "2026-10-01", initialInvestment: 1, currentValue: 2 },
        ],
      },
      investments[1],
    ]);
  });

  it("deletes an account and its holdings when it leaves the list", async () => {
    const withHolding = account(ACCOUNT_A, "지울 계좌", {
      holdings: [
        {
          id: HOLDING_A,
          market: "KRX",
          ticker: "005930",
          name: "삼성전자",
          currency: "KRW",
          quantity: 1,
          memo: "",
        },
      ],
    });
    await writeTableEnvelope(
      driver,
      "investment-storage",
      envelope({ investments: [withHolding, account(ACCOUNT_B, "남길 계좌")] }, 6)
    );

    await writeTableEnvelope(
      driver,
      "investment-storage",
      envelope({ investments: [account(ACCOUNT_B, "남길 계좌")] }, 6)
    );

    expect(await driver.query("SELECT id FROM investment_account")).toEqual([{ id: ACCOUNT_B }]);
    expect(await driver.query("SELECT id FROM stock_holding")).toEqual([]);
  });

  it("keeps an account's creation time across saves", async () => {
    await writeTableEnvelope(
      driver,
      "investment-storage",
      envelope({ investments: [account(ACCOUNT_A, "계좌")] }, 6)
    );
    const [first] = await driver.query<{ createdAt: string }>(
      "SELECT createdAt FROM investment_account"
    );

    await writeTableEnvelope(
      driver,
      "investment-storage",
      envelope({ investments: [account(ACCOUNT_A, "이름 바꿈")] }, 6)
    );

    const [second] = await driver.query<{ createdAt: string }>(
      "SELECT createdAt FROM investment_account"
    );
    expect(second?.createdAt).toBe(first?.createdAt);
  });

  it("skips an account the server would reject and keeps the rest", async () => {
    await writeTableEnvelope(
      driver,
      "investment-storage",
      envelope({ investments: [account(ACCOUNT_A, "정상"), { id: ACCOUNT_B, accountName: 42 }] }, 6)
    );

    expect(await driver.query("SELECT id FROM investment_account")).toEqual([{ id: ACCOUNT_A }]);
  });

  it("ignores a value that is not an envelope", async () => {
    await writeTableEnvelope(
      driver,
      "investment-storage",
      envelope({ investments: [account(ACCOUNT_A, "계좌")] }, 6)
    );

    await writeTableEnvelope(driver, "investment-storage", "not json");

    expect(await driver.query("SELECT id FROM investment_account")).toEqual([{ id: ACCOUNT_A }]);
  });
});

describe("portfolio-storage", () => {
  const portfolio = {
    id: PORTFOLIO,
    name: "안정형",
    color: "#00ff00",
    note: "",
    accountIds: [ACCOUNT_A],
    driftMode: "relative",
    driftThresholdPercent: 5,
    allocations: [
      {
        id: ALLOCATION,
        market: "KRX",
        ticker: "005930",
        name: "삼성전자",
        currency: "KRW",
        targetPercent: 100,
      },
    ],
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-02T00:00:00.000Z",
  };

  it("reads back portfolios with their target allocations", async () => {
    await writeTableEnvelope(driver, "portfolio-storage", envelope({ portfolios: [portfolio] }, 3));

    const result = await read(driver, "portfolio-storage");

    expect(result).toEqual({ state: { portfolios: [portfolio] }, version: 3 });
    expect(await driver.query("SELECT targetPercent FROM portfolio_allocation")).toEqual([
      { targetPercent: 100 },
    ]);
  });

  it("links the account to the portfolio like the server's portfolioId column", async () => {
    await writeTableEnvelope(
      driver,
      "investment-storage",
      envelope({ investments: [account(ACCOUNT_A, "계좌"), account(ACCOUNT_B, "다른 계좌")] }, 6)
    );
    await writeTableEnvelope(driver, "portfolio-storage", envelope({ portfolios: [portfolio] }, 3));

    // 계좌를 다시 저장해도 연결은 유지된다.
    await writeTableEnvelope(
      driver,
      "investment-storage",
      envelope(
        { investments: [account(ACCOUNT_A, "이름 바꿈"), account(ACCOUNT_B, "다른 계좌")] },
        6
      )
    );

    expect(
      await driver.query("SELECT id, portfolioId FROM investment_account ORDER BY accountName")
    ).toEqual([
      { id: ACCOUNT_B, portfolioId: null },
      { id: ACCOUNT_A, portfolioId: PORTFOLIO },
    ]);
  });
});

describe("rebalancing-storage", () => {
  it("reads back sessions with their tasks and result", async () => {
    const session = {
      id: SESSION,
      accountId: ACCOUNT_A,
      accountName: "계좌",
      portfolioId: PORTFOLIO,
      portfolioName: "안정형",
      cashDelta: -1200,
      tasks: [
        {
          id: "task-1",
          market: "KRX",
          ticker: "005930",
          name: "삼성전자",
          action: "매수",
          amount: 70_000,
          price: 70_000,
          quantity: 1,
          priceAsOf: null,
          priceKind: null,
          executedQuantity: null,
          executedPrice: null,
          orderedQuantity: null,
          orderedPrice: null,
          done: false,
        },
      ],
      startedAt: "2026-11-10T01:02:03.000Z",
      completedAt: null,
      result: null,
    };

    await writeTableEnvelope(driver, "rebalancing-storage", envelope({ sessions: [session] }, 1));

    expect(await read(driver, "rebalancing-storage")).toEqual({
      state: { sessions: [session] },
      version: 1,
    });
  });
});

describe("seedbook.preferences", () => {
  it("shares the user_preference row with the holdings sort option", async () => {
    await writeTableEnvelope(
      driver,
      "investment-storage",
      envelope({ investments: [], holdingsSortOption: "nameAsc" }, 6)
    );
    await writeTableEnvelope(
      driver,
      "seedbook.preferences",
      envelope({ rebalancingTaskSort: "evalAsc", rebalancingCollapsedSections: ["filled"] }, 1)
    );

    expect(await read(driver, "seedbook.preferences")).toEqual({
      state: { rebalancingTaskSort: "evalAsc", rebalancingCollapsedSections: ["filled"] },
      version: 1,
    });
    expect((await read(driver, "investment-storage"))?.state.holdingsSortOption).toBe("nameAsc");
  });
});

describe("clearDeviceTables", () => {
  it("removes every saved row", async () => {
    await writeTableEnvelope(
      driver,
      "investment-storage",
      envelope({ investments: [account(ACCOUNT_A, "계좌")], holdingsSortOption: "nameAsc" }, 6)
    );

    await clearDeviceTables(driver);

    expect(await readTableEnvelope(driver, "investment-storage")).toBeNull();
    expect(await driver.query("SELECT * FROM user_list_order")).toEqual([]);
  });
});
