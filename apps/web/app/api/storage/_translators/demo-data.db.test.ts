import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { BackupSections } from "@web/features/settings/utils/data-backup";
import { assignDemoDataIds } from "@web/features/settings/utils/demo-data";
import { openTestDb } from "@web/test/db/test-db";
import { afterAll, expect, it } from "vitest";
import { investmentTranslator } from "./investment";
import { portfolioTranslator } from "./portfolio";

/** 같은 DB 의 여러 사용자가 설정 화면의 데모 데이터를 불러와 클라우드에 올릴 수 있어야 한다. */

const { db, createTestUser, close } = openTestDb();
afterAll(close);

const fixture = JSON.parse(
  readFileSync(resolve(__dirname, "../../../../public/seed-data/user-data.json"), "utf8")
) as BackupSections;

async function uploadDemoData(userId: string) {
  const { investments, portfolios } = await assignDemoDataIds(fixture, userId);
  await investmentTranslator.write(db, userId, { state: { investments }, version: 4 });
  await portfolioTranslator.write(db, userId, { state: { portfolios }, version: 3 });
}

async function storedDemoData(userId: string) {
  const investments = await investmentTranslator.read(db, userId);
  const portfolios = await portfolioTranslator.read(db, userId);
  return {
    investments: investments?.state.investments,
    portfolios: portfolios?.state.portfolios,
  };
}

async function expectedDemoData(userId: string) {
  const { investments, portfolios } = await assignDemoDataIds(fixture, userId);
  return {
    investments: investments?.map((i) =>
      expect.objectContaining({
        id: i.id,
        accountName: i.accountName,
        holdings: i.holdings,
        cashItems: i.cashItems,
      })
    ),
    portfolios: portfolios?.map((p) =>
      expect.objectContaining({ id: p.id, accountIds: p.accountIds, allocations: p.allocations })
    ),
  };
}

it("lets two users in the same database upload the demo data", async () => {
  const first = await createTestUser();
  const second = await createTestUser();

  await uploadDemoData(first);
  await uploadDemoData(second);

  expect(await storedDemoData(first)).toEqual(await expectedDemoData(first));
  expect(await storedDemoData(second)).toEqual(await expectedDemoData(second));
});

it("does not duplicate anything when the same user uploads the demo data again", async () => {
  const userId = await createTestUser();

  await uploadDemoData(userId);
  await uploadDemoData(userId);

  expect(await storedDemoData(userId)).toEqual(await expectedDemoData(userId));
});
