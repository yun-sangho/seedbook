import { randomUUID } from "crypto";
import { debtsTranslator } from "@web/app/api/storage/_translators/debts";
import { openTestDb } from "@web/test/db/test-db";
import { afterAll, describe, expect, it } from "vitest";
import { applyMutation } from "./apply-mutation";
import { pullChanges } from "./pull";

const { db, createTestUser, close } = openTestDb();
afterAll(close);

function debtData(loanName = "전세대출") {
  return {
    loanName,
    loanType: "전세",
    lender: "은행",
    amount: 100_000_000,
    interestRate: 4.1,
    maturityDate: "2028-01-01",
    monthlyPayment: 350_000,
    note: "",
  };
}

describe("applyMutation: debt upsert", () => {
  it("creates a new debt at version 1", async () => {
    const userId = await createTestUser();
    const id = randomUUID();

    const result = await applyMutation(db, userId, {
      entity: "debt",
      op: "upsert",
      id,
      data: debtData(),
    });

    expect(result).toEqual({ status: "ok", version: 1 });
  });

  it("updates a debt and bumps the version", async () => {
    const userId = await createTestUser();
    const id = randomUUID();
    await applyMutation(db, userId, {
      entity: "debt",
      op: "upsert",
      id,
      data: debtData("a"),
    });

    const result = await applyMutation(db, userId, {
      entity: "debt",
      op: "upsert",
      id,
      data: debtData("b"),
    });

    expect(result).toEqual({ status: "ok", version: 2 });
    const { changes } = await pullChanges(db, userId, null);
    expect(changes.debt).toEqual([
      expect.objectContaining({ id, version: 2, data: expect.objectContaining({ loanName: "b" }) }),
    ]);
  });

  it("lets the last write win and ignores a stale baseVersion from older clients", async () => {
    const userId = await createTestUser();
    const id = randomUUID();
    await applyMutation(db, userId, {
      entity: "debt",
      op: "upsert",
      id,
      baseVersion: 0,
      data: debtData("first"),
    });
    await applyMutation(db, userId, {
      entity: "debt",
      op: "upsert",
      id,
      baseVersion: 1,
      data: debtData("other device"),
    });

    const result = await applyMutation(db, userId, {
      entity: "debt",
      op: "upsert",
      id,
      baseVersion: 1,
      data: debtData("stale device, saved last"),
    });

    expect(result).toEqual({ status: "ok", version: 3 });
    const { changes } = await pullChanges(db, userId, null);
    expect(changes.debt[0]?.data).toMatchObject({ loanName: "stale device, saved last" });
  });

  it("rejects writing another user's debt and leaves it unchanged", async () => {
    const owner = await createTestUser();
    const attacker = await createTestUser();
    const id = randomUUID();
    await applyMutation(db, owner, {
      entity: "debt",
      op: "upsert",
      id,
      data: debtData("owner"),
    });

    const result = await applyMutation(db, attacker, {
      entity: "debt",
      op: "upsert",
      id,
      data: debtData("hijacked"),
    });

    expect(result).toEqual({ status: "rejected", reason: "forbidden" });
    const { changes } = await pullChanges(db, owner, null);
    expect(changes.debt[0]?.data).toMatchObject({ loanName: "owner" });
  });

  it("rejects malformed data", async () => {
    const userId = await createTestUser();

    const result = await applyMutation(db, userId, {
      entity: "debt",
      op: "upsert",
      id: randomUUID(),
      data: { ...debtData(), amount: "lots" },
    });

    expect(result).toEqual({ status: "rejected", reason: "invalid" });
  });

  it("revives a deleted debt when it is saved again", async () => {
    const userId = await createTestUser();
    const id = randomUUID();
    await applyMutation(db, userId, {
      entity: "debt",
      op: "upsert",
      id,
      data: debtData(),
    });
    await applyMutation(db, userId, { entity: "debt", op: "delete", id });

    const result = await applyMutation(db, userId, {
      entity: "debt",
      op: "upsert",
      id,
      data: debtData("back"),
    });

    expect(result).toEqual({ status: "ok", version: 3 });
    const { changes } = await pullChanges(db, userId, null);
    expect(changes.debt).toEqual([expect.objectContaining({ id, deletedAt: null })]);
  });
});

describe("applyMutation: debt delete", () => {
  it("tombstones the debt and bumps the version", async () => {
    const userId = await createTestUser();
    const id = randomUUID();
    await applyMutation(db, userId, {
      entity: "debt",
      op: "upsert",
      id,
      data: debtData(),
    });

    const result = await applyMutation(db, userId, {
      entity: "debt",
      op: "delete",
      id,
    });

    expect(result).toEqual({ status: "ok", version: 2 });
  });

  it("is idempotent for an already deleted or unknown debt", async () => {
    const userId = await createTestUser();
    const id = randomUUID();
    await applyMutation(db, userId, {
      entity: "debt",
      op: "upsert",
      id,
      data: debtData(),
    });
    await applyMutation(db, userId, { entity: "debt", op: "delete", id });

    const again = await applyMutation(db, userId, {
      entity: "debt",
      op: "delete",
      id,
    });
    const unknown = await applyMutation(db, userId, {
      entity: "debt",
      op: "delete",
      id: randomUUID(),
    });

    expect(again).toEqual({ status: "ok", version: 2 });
    expect(unknown).toEqual({ status: "ok" });
  });

  it("deletes even when the debt changed since the client saw it (last write wins)", async () => {
    const userId = await createTestUser();
    const id = randomUUID();
    await applyMutation(db, userId, {
      entity: "debt",
      op: "upsert",
      id,
      data: debtData(),
    });
    await applyMutation(db, userId, {
      entity: "debt",
      op: "upsert",
      id,
      data: debtData("edited elsewhere"),
    });

    const result = await applyMutation(db, userId, {
      entity: "debt",
      op: "delete",
      id,
    });

    expect(result).toEqual({ status: "ok", version: 3 });
  });

  it("rejects deleting another user's debt", async () => {
    const owner = await createTestUser();
    const attacker = await createTestUser();
    const id = randomUUID();
    await applyMutation(db, owner, {
      entity: "debt",
      op: "upsert",
      id,
      data: debtData(),
    });

    const result = await applyMutation(db, attacker, {
      entity: "debt",
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
      domain: "debts",
      order,
    });

    expect(result).toEqual({ status: "ok" });
    const { changes } = await pullChanges(db, userId, null);
    expect(changes.listOrder).toEqual([{ domain: "debts", order }]);
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
        entity: "debt",
        op: "upsert",
        id,
        data: debtData(),
      });
    }
    await applyMutation(db, userId, { entity: "debt", op: "delete", id: gone });

    const { changes, cursor } = await pullChanges(db, userId, null);

    expect(changes.debt.map((d) => d.id)).toEqual([live]);
    expect(cursor).toEqual(expect.any(String));
  });

  it("returns tombstones and newer rows after a cursor", async () => {
    const userId = await createTestUser();
    const id = randomUUID();
    await applyMutation(db, userId, {
      entity: "debt",
      op: "upsert",
      id,
      data: debtData(),
    });
    const { cursor } = await pullChanges(db, userId, null);

    await applyMutation(db, userId, { entity: "debt", op: "delete", id });
    const { changes } = await pullChanges(db, userId, cursor);

    expect(changes.debt).toEqual([
      expect.objectContaining({ id, version: 2, deletedAt: expect.any(String), data: null }),
    ]);
  });

  it("never returns another user's rows", async () => {
    const userId = await createTestUser();
    const other = await createTestUser();
    await applyMutation(db, other, {
      entity: "debt",
      op: "upsert",
      id: randomUUID(),
      data: debtData(),
    });

    const { changes } = await pullChanges(db, userId, null);

    expect(changes.debt).toEqual([]);
  });

  it("sees debts written through the legacy envelope translator", async () => {
    const userId = await createTestUser();
    const id = randomUUID();
    await debtsTranslator.write(db, userId, {
      state: { debts: [{ id, ...debtData("from envelope") }] },
      version: 2,
    });

    const { changes } = await pullChanges(db, userId, null);

    expect(changes.debt).toEqual([
      expect.objectContaining({ id, data: expect.objectContaining({ loanName: "from envelope" }) }),
    ]);
    expect(changes.listOrder).toEqual([{ domain: "debts", order: [id] }]);
  });
});
