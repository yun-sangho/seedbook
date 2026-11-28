import { schema } from "@seedbook/database";
import { openTestDb } from "@web/test/db/test-db";
import { afterAll, describe, expect, it } from "vitest";
import { readAccountPreferences, writeAccountPreferences } from "./preferences";

const { db, createTestUser, close } = openTestDb();
afterAll(close);

describe("account preferences (real Postgres)", () => {
  it("are each screen's default when the user has never chosen anything", async () => {
    const userId = await createTestUser();

    expect(await readAccountPreferences(db, userId)).toEqual({
      rebalancingTaskSort: "nameDesc",
      rebalancingCollapsedSections: [],
      accountSortOption: "evalDesc",
      portfolioStockSortOption: "driftDesc",
      holdingsSortOption: "evalDesc",
    });
  });

  it("reads back what was written", async () => {
    const userId = await createTestUser();

    await writeAccountPreferences(db, userId, {
      rebalancingTaskSort: "evalAsc",
      rebalancingCollapsedSections: ["filled", "ordered"],
      accountSortOption: "evalAsc",
      portfolioStockSortOption: "nameAsc",
      holdingsSortOption: "nameAsc",
    });

    expect(await readAccountPreferences(db, userId)).toEqual({
      rebalancingTaskSort: "evalAsc",
      rebalancingCollapsedSections: ["filled", "ordered"],
      accountSortOption: "evalAsc",
      portfolioStockSortOption: "nameAsc",
      holdingsSortOption: "nameAsc",
    });
  });

  it("changes only the preferences it was given", async () => {
    const userId = await createTestUser();

    await writeAccountPreferences(db, userId, { rebalancingTaskSort: "evalAsc" });
    await writeAccountPreferences(db, userId, { rebalancingCollapsedSections: ["filled"] });
    await writeAccountPreferences(db, userId, { portfolioStockSortOption: "evalDesc" });

    expect(await readAccountPreferences(db, userId)).toMatchObject({
      rebalancingTaskSort: "evalAsc",
      rebalancingCollapsedSections: ["filled"],
      portfolioStockSortOption: "evalDesc",
      accountSortOption: "evalDesc",
    });
  });

  it("keeps the user's storage mode when writing", async () => {
    const userId = await createTestUser();
    await db
      .insert(schema.userPreference)
      .values({ userId, storageMode: "cloud", holdingsSortOption: "nameAsc" });

    await writeAccountPreferences(db, userId, { accountSortOption: "evalAsc" });

    const row = await db.query.userPreference.findFirst({
      where: (t, { eq }) => eq(t.userId, userId),
    });
    expect(row).toMatchObject({
      storageMode: "cloud",
      holdingsSortOption: "nameAsc",
      accountSortOption: "evalAsc",
    });
  });

  it("reads a stored option that no longer exists as the default", async () => {
    const userId = await createTestUser();
    await db
      .insert(schema.userPreference)
      .values({ userId, accountSortOption: "default", rebalancingTaskSort: "gone" });

    expect(await readAccountPreferences(db, userId)).toMatchObject({
      accountSortOption: "evalDesc",
      rebalancingTaskSort: "nameDesc",
    });
  });

  it("does not leak another user's preferences", async () => {
    const a = await createTestUser();
    const b = await createTestUser();

    await writeAccountPreferences(db, a, { portfolioStockSortOption: "nameDesc" });

    expect((await readAccountPreferences(db, b)).portfolioStockSortOption).toBe("driftDesc");
  });
});
