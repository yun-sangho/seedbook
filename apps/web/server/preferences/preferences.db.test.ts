import { openTestDb } from "@web/test/db/test-db";
import { afterAll, describe, expect, it } from "vitest";
import { readRebalancingTaskSort, writeRebalancingTaskSort } from "./preferences";

const { db, createTestUser, close } = openTestDb();
afterAll(close);

describe("rebalancing trade sort preference (real Postgres)", () => {
  it("is name descending when the user has never chosen one", async () => {
    const userId = await createTestUser();

    expect(await readRebalancingTaskSort(db, userId)).toBe("nameDesc");
  });

  it("reads back what was written", async () => {
    const userId = await createTestUser();

    await writeRebalancingTaskSort(db, userId, "evalAsc");

    expect(await readRebalancingTaskSort(db, userId)).toBe("evalAsc");
  });

  it("keeps the user's other preferences when writing", async () => {
    const userId = await createTestUser();
    const { schema } = await import("@seedbook/database");
    await db
      .insert(schema.userPreference)
      .values({ userId, storageMode: "cloud", holdingsSortOption: "value" });

    await writeRebalancingTaskSort(db, userId, "nameAsc");

    const row = await db.query.userPreference.findFirst({
      where: (t, { eq }) => eq(t.userId, userId),
    });
    expect(row).toMatchObject({
      storageMode: "cloud",
      holdingsSortOption: "value",
      rebalancingTaskSort: "nameAsc",
    });
  });

  it("does not leak another user's preference", async () => {
    const a = await createTestUser();
    const b = await createTestUser();

    await writeRebalancingTaskSort(db, a, "evalDesc");

    expect(await readRebalancingTaskSort(db, b)).toBe("nameDesc");
  });
});
