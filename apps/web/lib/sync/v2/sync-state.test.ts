import type { PulledRecord, SyncOpResult } from "@seedbook/domain";
import { describe, expect, it } from "vitest";
import { applyChangesToMap } from "./changes";
import type { LocalRecord, RecordMap } from "./records";
import {
  applyPulled,
  applyPushResults,
  emptySyncState,
  nextPushBatch,
  recordLocalChanges,
  type SyncState,
} from "./sync-state";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const HOLDING = "33333333-3333-4333-8333-333333333333";
const NOW = "2026-11-28T00:00:00.000Z";

const accountRecord = (fields: Record<string, unknown> = {}): LocalRecord => ({
  type: "account",
  id: ACCOUNT,
  parentId: null,
  sortKey: "a0",
  fields: {
    accountName: "연금",
    accountType: "연금",
    currency: "KRW",
    initialInvestment: 1_000_000,
    currentValue: 1_100_000,
    note: "",
    color: "#00aa00",
    portfolioId: null,
    ...fields,
  },
});

const holdingRecord = (fields: Record<string, unknown> = {}): LocalRecord => ({
  type: "holding",
  id: HOLDING,
  parentId: ACCOUNT,
  sortKey: "a0",
  fields: {
    market: "KR",
    ticker: "005930",
    name: "삼성전자",
    currency: "KRW",
    quantity: 10,
    memo: "",
    ...fields,
  },
});

const mapOf = (...records: LocalRecord[]): RecordMap =>
  new Map(records.map((r) => [`${r.type}:${r.id}`, r]));

/** 서버가 이미 아는 레코드 (섀도가 있다). */
function synced(...records: LocalRecord[]): SyncState {
  const state = emptySyncState(NOW);
  for (const r of records) {
    state.shadow[`${r.type}:${r.id}`] = {
      parentId: r.parentId,
      version: 1,
      changeSeq: "1",
      sortKey: r.sortKey,
      fields: { ...r.fields },
    };
  }
  return state;
}

const pulled = (record: LocalRecord, extra: Partial<PulledRecord> = {}): PulledRecord => ({
  type: record.type,
  id: record.id,
  parentId: record.parentId,
  version: 2,
  changeSeq: "10",
  deletedAt: null,
  sortKey: record.sortKey,
  fields: record.fields,
  ...extra,
});

describe("recordLocalChanges", () => {
  it("creates a record the server has never seen with all its fields", () => {
    const state = recordLocalChanges(emptySyncState(NOW), new Map(), mapOf(accountRecord()));

    expect(state.outbox[`account:${ACCOUNT}`]).toMatchObject({
      op: "create",
      fields: accountRecord().fields,
      sortKey: "a0",
    });
  });

  it("patches only the changed field of a record the server knows", () => {
    const before = mapOf(holdingRecord());
    const state = recordLocalChanges(
      synced(holdingRecord()),
      before,
      mapOf(holdingRecord({ quantity: 12 }))
    );

    expect(state.outbox[`holding:${HOLDING}`]).toMatchObject({
      op: "patch",
      fields: { quantity: 12 },
    });
    expect(state.outbox[`holding:${HOLDING}`]?.sortKey).toBeUndefined();
  });

  it("merges later edits into the waiting patch", () => {
    let state = recordLocalChanges(
      synced(holdingRecord()),
      mapOf(holdingRecord()),
      mapOf(holdingRecord({ quantity: 12 }))
    );
    state = recordLocalChanges(
      state,
      mapOf(holdingRecord({ quantity: 12 })),
      mapOf(holdingRecord({ quantity: 12, memo: "장기" }))
    );

    expect(state.outbox[`holding:${HOLDING}`]?.fields).toEqual({ quantity: 12, memo: "장기" });
  });

  it("replaces a waiting patch with a delete", () => {
    let state = recordLocalChanges(
      synced(holdingRecord()),
      mapOf(holdingRecord()),
      mapOf(holdingRecord({ quantity: 12 }))
    );
    state = recordLocalChanges(state, mapOf(holdingRecord({ quantity: 12 })), new Map());

    expect(state.outbox[`holding:${HOLDING}`]).toMatchObject({ op: "delete", fields: {} });
  });

  it("forgets a record that is deleted before it was ever sent", () => {
    let state = recordLocalChanges(emptySyncState(NOW), new Map(), mapOf(holdingRecord()));
    state = recordLocalChanges(state, mapOf(holdingRecord()), new Map());

    expect(state.outbox).toEqual({});
  });

  it("never puts fields the app does not know into a patch", () => {
    const state = recordLocalChanges(
      synced(holdingRecord({ avgPrice: 1 })),
      mapOf(holdingRecord({ avgPrice: 1 })),
      mapOf(holdingRecord({ avgPrice: 2, quantity: 5 }))
    );

    expect(state.outbox[`holding:${HOLDING}`]?.fields).toEqual({ quantity: 5 });
  });
});

describe("nextPushBatch", () => {
  it("sends parents before children", () => {
    let state = recordLocalChanges(emptySyncState(NOW), new Map(), mapOf(holdingRecord()));
    state = recordLocalChanges(
      state,
      mapOf(holdingRecord()),
      mapOf(holdingRecord(), accountRecord())
    );

    expect(nextPushBatch(state).map((s) => s.op.type)).toEqual(["account", "holding"]);
    expect(nextPushBatch(state)[1]?.op).toMatchObject({ op: "create", parentId: ACCOUNT });
  });

  it("sends at most 200 ops at a time", () => {
    const records = Array.from({ length: 250 }, (_, i) => ({
      ...holdingRecord(),
      id: `33333333-3333-4333-8333-${String(i).padStart(12, "0")}`,
    }));
    const state = recordLocalChanges(emptySyncState(NOW), new Map(), mapOf(...records));

    expect(nextPushBatch(state)).toHaveLength(200);
  });
});

describe("applyPushResults", () => {
  const editedHolding = () => {
    const state = recordLocalChanges(
      synced(holdingRecord()),
      mapOf(holdingRecord()),
      mapOf(holdingRecord({ quantity: 12 }))
    );
    return { state, sent: nextPushBatch(state) };
  };

  it("moves an accepted patch into the shadow", () => {
    const { state, sent } = editedHolding();
    const result = applyPushResults(
      state,
      sent,
      [{ status: "ok", version: 2, changeSeq: "5" }],
      mapOf(holdingRecord({ quantity: 12 }))
    );

    expect(result.state.outbox).toEqual({});
    expect(result.state.shadow[`holding:${HOLDING}`]).toMatchObject({
      version: 2,
      changeSeq: "5",
      fields: { quantity: 12, ticker: "005930" },
    });
  });

  it("keeps a change made while the request was in flight", () => {
    const { state, sent } = editedHolding();
    const later = recordLocalChanges(
      state,
      mapOf(holdingRecord({ quantity: 12 })),
      mapOf(holdingRecord({ quantity: 13 }))
    );
    const result = applyPushResults(
      later,
      sent,
      [{ status: "ok", version: 2, changeSeq: "5" }],
      mapOf(holdingRecord({ quantity: 13 }))
    );

    expect(result.state.outbox[`holding:${HOLDING}`]?.fields).toEqual({ quantity: 13 });
  });

  it("quarantines a rejected field and puts the server value back", () => {
    const { state, sent } = editedHolding();
    const result = applyPushResults(
      state,
      sent,
      [
        {
          status: "partial",
          version: 1,
          changeSeq: "1",
          rejected: [{ field: "quantity", code: "min" }],
        },
      ],
      mapOf(holdingRecord({ quantity: 12 }))
    );

    expect(result.quarantine).toEqual([
      { type: "holding", id: HOLDING, field: "quantity", code: "min", value: 12 },
    ]);
    expect(result.changes).toEqual([
      expect.objectContaining({ op: "put", id: HOLDING, fields: { quantity: 10 } }),
    ]);
    expect(result.state.outbox).toEqual({});
  });

  it("deletes the record and its children when another device deleted it", () => {
    let state = synced(accountRecord(), holdingRecord());
    state = recordLocalChanges(
      state,
      mapOf(accountRecord(), holdingRecord()),
      mapOf(accountRecord({ note: "메모" }), holdingRecord())
    );
    const result = applyPushResults(
      state,
      nextPushBatch(state),
      [{ status: "rejected", code: "deleted" }],
      mapOf(accountRecord({ note: "메모" }), holdingRecord())
    );

    expect(result.changes).toEqual([
      { op: "delete", type: "account", id: ACCOUNT },
      { op: "delete", type: "holding", id: HOLDING },
    ]);
    expect(result.quarantine).toEqual([]);
    expect(result.state.shadow).toEqual({});
  });

  it("creates the record again when the server does not have it", () => {
    const { state, sent } = editedHolding();
    const result = applyPushResults(
      state,
      sent,
      [{ status: "rejected", code: "not_found" }],
      mapOf(holdingRecord({ quantity: 12 }))
    );

    expect(result.state.outbox[`holding:${HOLDING}`]).toMatchObject({
      op: "create",
      fields: holdingRecord({ quantity: 12 }).fields,
    });
  });

  it("quarantines a whole rejected op without deleting the local record", () => {
    const state = recordLocalChanges(emptySyncState(NOW), new Map(), mapOf(holdingRecord()));
    const results: SyncOpResult[] = [{ status: "rejected", code: "parent_missing" }];
    const result = applyPushResults(state, nextPushBatch(state), results, mapOf(holdingRecord()));

    expect(result.quarantine).toEqual([
      expect.objectContaining({ id: HOLDING, field: "*", code: "parent_missing" }),
    ]);
    expect(result.changes).toEqual([]);
    expect(result.state.outbox).toEqual({});
  });
});

describe("applyPulled", () => {
  it("takes the server record when nothing is waiting to be sent", () => {
    const local = mapOf(holdingRecord());
    const server = holdingRecord({ quantity: 20, avgPrice: 70_000 });
    const result = applyPulled(synced(holdingRecord()), [pulled(server)], local, {
      full: false,
      cursor: "c1",
    });

    expect(applyChangesToMap(local, result.changes).get(`holding:${HOLDING}`)?.fields).toEqual(
      server.fields
    );
    expect(result.state.cursor).toBe("c1");
    expect(result.state.shadow[`holding:${HOLDING}`]?.fields).toEqual(server.fields);
  });

  it("keeps a waiting local edit on top of another field the server changed", () => {
    const state = recordLocalChanges(
      synced(holdingRecord()),
      mapOf(holdingRecord()),
      mapOf(holdingRecord({ quantity: 12 }))
    );
    const local = mapOf(holdingRecord({ quantity: 12 }));
    const result = applyPulled(state, [pulled(holdingRecord({ memo: "다른 기기" }))], local, {
      full: false,
      cursor: "c1",
    });

    expect(
      applyChangesToMap(local, result.changes).get(`holding:${HOLDING}`)?.fields
    ).toMatchObject({ quantity: 12, memo: "다른 기기" });
    expect(result.state.outbox[`holding:${HOLDING}`]?.fields).toEqual({ quantity: 12 });
  });

  it("lets a deletion win over a waiting local edit", () => {
    const state = recordLocalChanges(
      synced(holdingRecord()),
      mapOf(holdingRecord()),
      mapOf(holdingRecord({ quantity: 12 }))
    );
    const result = applyPulled(
      state,
      [pulled(holdingRecord(), { deletedAt: NOW })],
      mapOf(holdingRecord({ quantity: 12 })),
      { full: false, cursor: "c1" }
    );

    expect(result.changes).toEqual([{ op: "delete", type: "holding", id: HOLDING }]);
    expect(result.state.outbox).toEqual({});
  });

  it("on a full pull, deletes records the server no longer has and creates ones it never had", () => {
    const other = { ...holdingRecord(), id: "33333333-3333-4333-8333-00000000000f" };
    const result = applyPulled(
      synced(holdingRecord()),
      [pulled(accountRecord())],
      mapOf(accountRecord(), holdingRecord(), other),
      { full: true, cursor: "c1" }
    );

    expect(result.changes).toContainEqual({ op: "delete", type: "holding", id: HOLDING });
    expect(result.state.outbox[`holding:${other.id}`]).toMatchObject({ op: "create" });
  });
});
