import { randomUUID } from "crypto";
import { openTestDb } from "@web/test/db/test-db";
import { afterAll, describe, expect, it } from "vitest";
import { applyMutation } from "./apply-mutation";
import { pullChanges } from "./pull";

const { db, createTestUser, close } = openTestDb();
afterAll(close);

/** 엔티티 저장소의 공통 규칙을 확인하는 데 쓰는 리밸런싱 한 건. */
function entityData(accountName = "연금저축") {
  return {
    accountId: "acc-1",
    accountName,
    portfolioId: "pf-1",
    portfolioName: "안정형",
    cashDelta: 0,
    tasks: [],
    startedAt: "2026-11-01T00:00:00.000Z",
    completedAt: null,
  };
}

describe("applyMutation: upsert (shared entity rules, via rebalancing)", () => {
  it("creates a new entity at version 1", async () => {
    const userId = await createTestUser();
    const id = randomUUID();

    const result = await applyMutation(db, userId, {
      entity: "rebalancing",
      op: "upsert",
      id,
      data: entityData(),
    });

    expect(result).toEqual({ status: "ok", version: 1 });
  });

  it("updates a entity and bumps the version", async () => {
    const userId = await createTestUser();
    const id = randomUUID();
    await applyMutation(db, userId, {
      entity: "rebalancing",
      op: "upsert",
      id,
      data: entityData("a"),
    });

    const result = await applyMutation(db, userId, {
      entity: "rebalancing",
      op: "upsert",
      id,
      data: entityData("b"),
    });

    expect(result).toEqual({ status: "ok", version: 2 });
    const { changes } = await pullChanges(db, userId, null);
    expect(changes.rebalancing!).toEqual([
      expect.objectContaining({
        id,
        version: 2,
        data: expect.objectContaining({ accountName: "b" }),
      }),
    ]);
  });

  it("lets the last write win and ignores a stale baseVersion from older clients", async () => {
    const userId = await createTestUser();
    const id = randomUUID();
    await applyMutation(db, userId, {
      entity: "rebalancing",
      op: "upsert",
      id,
      baseVersion: 0,
      data: entityData("first"),
    });
    await applyMutation(db, userId, {
      entity: "rebalancing",
      op: "upsert",
      id,
      baseVersion: 1,
      data: entityData("other device"),
    });

    const result = await applyMutation(db, userId, {
      entity: "rebalancing",
      op: "upsert",
      id,
      baseVersion: 1,
      data: entityData("stale device, saved last"),
    });

    expect(result).toEqual({ status: "ok", version: 3 });
    const { changes } = await pullChanges(db, userId, null);
    expect(changes.rebalancing![0]?.data).toMatchObject({
      accountName: "stale device, saved last",
    });
  });

  it("rejects writing another user's entity and leaves it unchanged", async () => {
    const owner = await createTestUser();
    const attacker = await createTestUser();
    const id = randomUUID();
    await applyMutation(db, owner, {
      entity: "rebalancing",
      op: "upsert",
      id,
      data: entityData("owner"),
    });

    const result = await applyMutation(db, attacker, {
      entity: "rebalancing",
      op: "upsert",
      id,
      data: entityData("hijacked"),
    });

    expect(result).toEqual({ status: "rejected", reason: "forbidden" });
    const { changes } = await pullChanges(db, owner, null);
    expect(changes.rebalancing![0]?.data).toMatchObject({ accountName: "owner" });
  });

  it("rejects malformed data", async () => {
    const userId = await createTestUser();

    const result = await applyMutation(db, userId, {
      entity: "rebalancing",
      op: "upsert",
      id: randomUUID(),
      data: { ...entityData(), cashDelta: "lots" },
    });

    expect(result).toEqual({ status: "rejected", reason: "invalid" });
  });

  it("revives a deleted entity when it is saved again", async () => {
    const userId = await createTestUser();
    const id = randomUUID();
    await applyMutation(db, userId, {
      entity: "rebalancing",
      op: "upsert",
      id,
      data: entityData(),
    });
    await applyMutation(db, userId, { entity: "rebalancing", op: "delete", id });

    const result = await applyMutation(db, userId, {
      entity: "rebalancing",
      op: "upsert",
      id,
      data: entityData("back"),
    });

    expect(result).toEqual({ status: "ok", version: 3 });
    const { changes } = await pullChanges(db, userId, null);
    expect(changes.rebalancing!).toEqual([expect.objectContaining({ id, deletedAt: null })]);
  });
});

describe("applyMutation: delete (shared entity rules, via rebalancing)", () => {
  it("tombstones the entity and bumps the version", async () => {
    const userId = await createTestUser();
    const id = randomUUID();
    await applyMutation(db, userId, {
      entity: "rebalancing",
      op: "upsert",
      id,
      data: entityData(),
    });

    const result = await applyMutation(db, userId, {
      entity: "rebalancing",
      op: "delete",
      id,
    });

    expect(result).toEqual({ status: "ok", version: 2 });
  });

  it("is idempotent for an already deleted or unknown entity", async () => {
    const userId = await createTestUser();
    const id = randomUUID();
    await applyMutation(db, userId, {
      entity: "rebalancing",
      op: "upsert",
      id,
      data: entityData(),
    });
    await applyMutation(db, userId, { entity: "rebalancing", op: "delete", id });

    const again = await applyMutation(db, userId, {
      entity: "rebalancing",
      op: "delete",
      id,
    });
    const unknown = await applyMutation(db, userId, {
      entity: "rebalancing",
      op: "delete",
      id: randomUUID(),
    });

    expect(again).toEqual({ status: "ok", version: 2 });
    expect(unknown).toEqual({ status: "ok" });
  });

  it("deletes even when the entity changed since the client saw it (last write wins)", async () => {
    const userId = await createTestUser();
    const id = randomUUID();
    await applyMutation(db, userId, {
      entity: "rebalancing",
      op: "upsert",
      id,
      data: entityData(),
    });
    await applyMutation(db, userId, {
      entity: "rebalancing",
      op: "upsert",
      id,
      data: entityData("edited elsewhere"),
    });

    const result = await applyMutation(db, userId, {
      entity: "rebalancing",
      op: "delete",
      id,
    });

    expect(result).toEqual({ status: "ok", version: 3 });
  });

  it("rejects deleting another user's entity", async () => {
    const owner = await createTestUser();
    const attacker = await createTestUser();
    const id = randomUUID();
    await applyMutation(db, owner, {
      entity: "rebalancing",
      op: "upsert",
      id,
      data: entityData(),
    });

    const result = await applyMutation(db, attacker, {
      entity: "rebalancing",
      op: "delete",
      id,
    });

    expect(result).toEqual({ status: "rejected", reason: "forbidden" });
  });
});

describe("applyMutation: list order", () => {
  it("stores the order for a known domain", async () => {
    const userId = await createTestUser();
    const order = [randomUUID(), randomUUID()];

    const result = await applyMutation(db, userId, {
      entity: "listOrder",
      op: "set",
      domain: "portfolios",
      order,
    });

    expect(result).toEqual({ status: "ok" });
    const { changes } = await pullChanges(db, userId, null);
    expect(changes.listOrder).toEqual([{ domain: "portfolios", order }]);
  });

  it("rejects an unknown domain", async () => {
    const userId = await createTestUser();

    const result = await applyMutation(db, userId, {
      entity: "listOrder",
      op: "set",
      domain: "nope",
      order: [],
    });

    expect(result).toEqual({ status: "rejected", reason: "invalid" });
  });
});

describe("applyMutation: unknown input", () => {
  it("rejects an unknown entity", async () => {
    const userId = await createTestUser();

    const result = await applyMutation(db, userId, { entity: "spaceship", op: "upsert" });

    expect(result).toEqual({ status: "rejected", reason: "invalid" });
  });
});

describe("pullChanges", () => {
  it("returns only live rows and a cursor on the first pull", async () => {
    const userId = await createTestUser();
    const live = randomUUID();
    const gone = randomUUID();
    for (const id of [live, gone]) {
      await applyMutation(db, userId, {
        entity: "rebalancing",
        op: "upsert",
        id,
        data: entityData(),
      });
    }
    await applyMutation(db, userId, { entity: "rebalancing", op: "delete", id: gone });

    const { changes, cursor } = await pullChanges(db, userId, null);

    expect(changes.rebalancing!.map((d) => d.id)).toEqual([live]);
    expect(cursor).toEqual(expect.any(String));
  });

  it("returns tombstones and newer rows after a cursor", async () => {
    const userId = await createTestUser();
    const id = randomUUID();
    await applyMutation(db, userId, {
      entity: "rebalancing",
      op: "upsert",
      id,
      data: entityData(),
    });
    const { cursor } = await pullChanges(db, userId, null);

    await applyMutation(db, userId, { entity: "rebalancing", op: "delete", id });
    const { changes } = await pullChanges(db, userId, cursor);

    expect(changes.rebalancing!).toEqual([
      expect.objectContaining({ id, version: 2, deletedAt: expect.any(String), data: null }),
    ]);
  });

  it("never returns another user's rows", async () => {
    const userId = await createTestUser();
    const other = await createTestUser();
    await applyMutation(db, other, {
      entity: "rebalancing",
      op: "upsert",
      id: randomUUID(),
      data: entityData(),
    });

    const { changes } = await pullChanges(db, userId, null);

    expect(changes.rebalancing!).toEqual([]);
  });
});
