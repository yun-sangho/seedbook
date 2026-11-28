import {
  ACCOUNT_A,
  ACCOUNT_B,
  ALLOCATION,
  HOLDING_A,
  HOLDING_B,
  holdingItem,
  investmentState,
  PORTFOLIO,
  portfolioItem,
  rebalancingState,
  SESSION,
} from "@mobile/lib/native/device-db/testing/envelope-fixtures";
import { harvestId, uuidv5 } from "@seedbook/domain";
import { describe, expect, it } from "vitest";
import { applyChangesToMap, planStoreChanges, type RecordChange } from "./changes";
import type { RecordMap } from "./records";
import {
  composeStore,
  decomposeStore,
  HARVEST_STORE,
  INVESTMENT_STORE,
  PORTFOLIO_STORE,
  REBALANCING_STORE,
  type RecordStoreKey,
} from "./store-records";

/** store 상태를 저장한 뒤의 레코드 (저장 경로와 같은 계획). */
function save(
  key: RecordStoreKey,
  state: Record<string, unknown>,
  current: RecordMap = new Map(),
  pendingLinks = new Map<string, string | null>()
): { map: RecordMap; changes: RecordChange[] } {
  const plan = decomposeStore(key, state, current);
  if (!plan) return { map: current, changes: [] };
  const changes = planStoreChanges(key, plan, current, pendingLinks);
  return { map: applyChangesToMap(current, changes), changes };
}

const investmentsState = investmentState;

describe("decompose / compose", () => {
  it("gives back the same investment state after saving", () => {
    const state = investmentsState();
    const { map } = save(INVESTMENT_STORE, state);

    expect(composeStore(INVESTMENT_STORE, map)).toEqual(state);
  });

  it("splits an account into account, holding, cash and history records", () => {
    const { map } = save(INVESTMENT_STORE, investmentsState());
    const types = [...map.values()].map((r) => r.type).sort();

    expect(types).toEqual([
      "account",
      "account",
      "accountRecord",
      "accountRecord",
      "cash",
      "holding",
      "holding",
    ]);
    expect(map.get(`accountRecord:${uuidv5(ACCOUNT_A, "2026-11-01")}`)?.parentId).toBe(ACCOUNT_A);
  });

  it("stores the account-portfolio link on the account record", () => {
    const { map: accounts } = save(INVESTMENT_STORE, investmentsState());
    const { map } = save(
      PORTFOLIO_STORE,
      { portfolios: [portfolioItem({ accountIds: [ACCOUNT_B] })] },
      accounts
    );

    expect(map.get(`account:${ACCOUNT_B}`)?.fields.portfolioId).toBe(PORTFOLIO);
    expect(map.get(`account:${ACCOUNT_A}`)?.fields.portfolioId).toBeUndefined();
    expect(map.get(`portfolio:${PORTFOLIO}`)?.fields.accountIds).toBeUndefined();
    expect(composeStore(PORTFOLIO_STORE, map).portfolios).toMatchObject([
      { id: PORTFOLIO, accountIds: [ACCOUNT_B] },
    ]);
  });

  it("keeps the link of an account the investment store has not saved yet", () => {
    const pending = new Map<string, string | null>();
    const { map: withPortfolio } = save(
      PORTFOLIO_STORE,
      { portfolios: [portfolioItem({ accountIds: [ACCOUNT_A] })] },
      new Map(),
      pending
    );
    const { map } = save(INVESTMENT_STORE, investmentsState(), withPortfolio, pending);

    expect(map.get(`account:${ACCOUNT_A}`)?.fields.portfolioId).toBe(PORTFOLIO);
  });

  it("unlinks the account when the portfolio drops it", () => {
    const { map: accounts } = save(INVESTMENT_STORE, investmentsState());
    const { map: linked } = save(
      PORTFOLIO_STORE,
      { portfolios: [portfolioItem({ accountIds: [ACCOUNT_A] })] },
      accounts
    );
    const { map } = save(
      PORTFOLIO_STORE,
      { portfolios: [portfolioItem({ accountIds: [] })] },
      linked
    );

    expect(map.get(`account:${ACCOUNT_A}`)?.fields.portfolioId).toBeNull();
  });

  it("maps rebalancing task ids to allocation ids", () => {
    const state = rebalancingState();
    const { map } = save(REBALANCING_STORE, state);

    const task = map.get(`rebalancingTask:${uuidv5(SESSION, ALLOCATION)}`);
    expect(task?.fields.allocationId).toBe(ALLOCATION);
    expect(composeStore(REBALANCING_STORE, map)).toEqual(state);
  });

  it("gives back the same harvests after saving, newest first", () => {
    const goal = (amount: number) => ({ amount, reachedAt: "2026-11-01T00:00:00.000Z" });
    const harvest = (season: number) => ({
      id: harvestId(PORTFOLIO, season),
      sourceType: "portfolio",
      sourceId: PORTFOLIO,
      sourceName: "안정형",
      season,
      plantKind: "fern",
      wish: "제주 여행",
      goals: [1, 2, 3, 4, 5].map(goal),
      harvestedAt: "2026-11-28T06:30:00.000Z",
      doneAt: null,
    });
    const state = { harvests: [harvest(2), harvest(1)] };

    const { map } = save(HARVEST_STORE, state);

    expect(map.get(`harvest:${harvestId(PORTFOLIO, 1)}`)?.parentId).toBeNull();
    expect(composeStore(HARVEST_STORE, map)).toEqual(state);
  });

  it("does not save a session whose id cannot make task ids", () => {
    const plan = decomposeStore(
      REBALANCING_STORE,
      { sessions: [{ ...rebalancingState().sessions[0], id: "legacy-1" }] },
      new Map()
    );

    expect(plan?.records).toEqual([]);
    expect(plan?.invalid).toEqual([expect.objectContaining({ id: "legacy-1" })]);
  });
});

describe("planStoreChanges", () => {
  it("changes nothing when the same state is saved again", () => {
    const { map } = save(INVESTMENT_STORE, investmentsState());

    expect(save(INVESTMENT_STORE, investmentsState(), map).changes).toEqual([]);
  });

  it("deletes only the holding the user removed", () => {
    const { map } = save(INVESTMENT_STORE, investmentsState());
    const state = investmentsState();
    state.investments[0]!.holdings = [holdingItem(HOLDING_A, "005930")];

    expect(save(INVESTMENT_STORE, state, map).changes).toEqual([
      { op: "delete", type: "holding", id: HOLDING_B },
    ]);
  });

  it("sends only the changed field of an edited holding", () => {
    const { map } = save(INVESTMENT_STORE, investmentsState());
    const state = investmentsState();
    state.investments[0]!.holdings = [
      holdingItem(HOLDING_A, "005930", 99),
      holdingItem(HOLDING_B, "000660", 2.5),
    ];

    const changes = save(INVESTMENT_STORE, state, map).changes;
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ op: "put", type: "holding", id: HOLDING_A });
  });

  it("changes only the moved account's sort key when reordering", () => {
    const { map } = save(INVESTMENT_STORE, investmentsState());
    const state = investmentsState();
    state.investments.reverse();

    const changes = save(INVESTMENT_STORE, state, map).changes;
    expect(changes.map((c) => c.id)).toEqual([ACCOUNT_B]);
    expect(composeStore(INVESTMENT_STORE, applyChangesToMap(map, changes)).investments).toEqual(
      state.investments
    );
  });

  it("does not delete anything when the list field is missing", () => {
    const { map } = save(INVESTMENT_STORE, investmentsState());

    expect(decomposeStore(INVESTMENT_STORE, {}, map)).toBeNull();
  });

  it("keeps fields the app does not know when saving over a record", () => {
    const { map } = save(INVESTMENT_STORE, investmentsState());
    const key = `holding:${HOLDING_A}`;
    const withUnknown = new Map(map);
    withUnknown.set(key, {
      ...(map.get(key) as NonNullable<ReturnType<typeof map.get>>),
      fields: { ...map.get(key)?.fields, avgPrice: 70_000 },
    });
    const state = investmentsState();
    state.investments[0]!.holdings[0] = holdingItem(HOLDING_A, "005930", 12);

    const { map: next } = save(INVESTMENT_STORE, state, withUnknown);
    expect(next.get(key)?.fields).toMatchObject({ quantity: 12, avgPrice: 70_000 });
  });
});
