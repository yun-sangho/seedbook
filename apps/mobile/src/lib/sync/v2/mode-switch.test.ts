import {
  envelope,
  PORTFOLIO,
  portfolioItem,
} from "@mobile/lib/native/device-db/testing/envelope-fixtures";
import type { PulledRecord, SyncOp } from "@seedbook/domain";
import { describe, expect, it } from "vitest";
import { createSyncEngine } from "./engine";
import { mergeLocalIntoCloud } from "./mode-switch";
import { composeStore, PORTFOLIO_STORE } from "./store-records";
import { memoryDevice } from "./testing";

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

/** 가진 레코드를 pull 로 주고 push 는 모두 받아들이는 서버. */
function server(records: PulledRecord[]) {
  const pushed: SyncOp[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    if (url.includes("/push")) {
      const { ops } = JSON.parse(String(init?.body)) as { ops: SyncOp[] };
      pushed.push(...ops);
      for (const op of ops) {
        const found = records.find((r) => r.id === op.id);
        if (found) Object.assign(found.fields, op.fields);
      }
      return json({ results: ops.map(() => ({ status: "ok", version: 2, changeSeq: "9" })) });
    }
    return json({ protocol: 2, records, cursor: "c", hasMore: false, reset: false });
  }) as unknown as typeof fetch;
  return { pushed, fetchFn };
}

const serverPortfolio = (fields: Record<string, unknown>): PulledRecord => {
  const { id, allocations, accountIds, createdAt, updatedAt, ...rest } = portfolioItem();
  return {
    type: "portfolio",
    id,
    parentId: null,
    version: 1,
    changeSeq: "1",
    deletedAt: null,
    sortKey: "a0",
    fields: { ...rest, ...fields },
  };
};

describe("mergeLocalIntoCloud", () => {
  it("keeps the plant that grew further on the server and sends the rest of the local edits", async () => {
    const device = memoryDevice({ cloud: false });
    await device.layer.saveStore(
      PORTFOLIO_STORE,
      envelope({ portfolios: [portfolioItem({ name: "로컬 이름", accountIds: [] })] }, 3)
    );
    const grown = { growthStage: 3, goalAmount: null, goalHistory: [] };
    const { pushed, fetchFn } = server([serverPortfolio(grown)]);
    const engine = createSyncEngine({ layer: device.layer, fetchFn, client: "test" });

    await mergeLocalIntoCloud(engine, device.layer);

    const portfolioOps = pushed.filter((op) => op.id === PORTFOLIO);
    expect(portfolioOps).toEqual([
      expect.objectContaining({ op: "patch", fields: { name: "로컬 이름" } }),
    ]);
    const [portfolio] = composeStore(PORTFOLIO_STORE, await device.layer.loadRecords())
      .portfolios as Array<Record<string, unknown>>;
    expect(portfolio).toMatchObject({ name: "로컬 이름", growthStage: 3 });
  });

  it("sends the local plant when it grew further on this device", async () => {
    const device = memoryDevice({ cloud: false });
    await device.layer.saveStore(
      PORTFOLIO_STORE,
      envelope({ portfolios: [portfolioItem({ accountIds: [] })] }, 3)
    );
    const { pushed, fetchFn } = server([serverPortfolio({ growthStage: 0, goalHistory: [] })]);
    const engine = createSyncEngine({ layer: device.layer, fetchFn, client: "test" });

    await mergeLocalIntoCloud(engine, device.layer);

    expect(pushed.find((op) => op.id === PORTFOLIO)?.fields).toMatchObject({ growthStage: 1 });
  });
});
