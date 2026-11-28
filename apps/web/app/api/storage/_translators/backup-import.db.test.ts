import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { backupAccountTag, resolveBackupIds } from "@web/features/settings/utils/backup-ids";
import {
  type BackupSections,
  buildBackup,
  parseBackup,
} from "@web/features/settings/utils/data-backup";
import { openTestDb } from "@web/test/db/test-db";
import { afterAll, expect, it } from "vitest";
import { investmentTranslator } from "./investment";
import { portfolioTranslator } from "./portfolio";
import { rebalancingTranslator } from "./rebalancing";

/** 다른 계정에서 내보낸 백업을 가져와 클라우드에 올릴 수 있어야 한다. */

const { db, createTestUser, close } = openTestDb();
afterAll(close);

/** 원래 계정이 클라우드에 올려 둔 데이터 (테스트마다 새 id). */
function newAccountData(): BackupSections {
  const fixture = readFileSync(
    resolve(__dirname, "../../../../../../packages/database/seed-data/user-data.json"),
    "utf8"
  );
  const ids = new Map<string, string>();
  const unique = fixture.replace(/5eed[0-9a-f]{4}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/g, (id) => {
    if (!ids.has(id)) ids.set(id, crypto.randomUUID());
    return ids.get(id)!;
  });
  const { investments, portfolios } = JSON.parse(unique) as BackupSections;
  const portfolio = portfolios.find((p) => p.accountIds.length > 0)!;
  return {
    investments,
    portfolios,
    rebalancingSessions: [
      {
        id: crypto.randomUUID(),
        accountId: portfolio.accountIds[0]!,
        accountName: "계좌",
        portfolioId: portfolio.id,
        portfolioName: portfolio.name,
        cashDelta: 0,
        tasks: [],
        startedAt: "2026-11-01T00:00:00.000Z",
        completedAt: null,
      },
    ],
  };
}

async function upload(userId: string, data: Partial<BackupSections>) {
  const { investments, portfolios, rebalancingSessions: sessions } = data;
  await investmentTranslator.write(db, userId, { state: { investments }, version: 4 });
  await portfolioTranslator.write(db, userId, { state: { portfolios }, version: 3 });
  await rebalancingTranslator.write(db, userId, { state: { sessions }, version: 1 });
}

async function stored(userId: string): Promise<BackupSections> {
  const investments = await investmentTranslator.read(db, userId);
  const portfolios = await portfolioTranslator.read(db, userId);
  const sessions = await rebalancingTranslator.read(db, userId);
  return {
    investments: (investments?.state.investments ?? []) as BackupSections["investments"],
    portfolios: (portfolios?.state.portfolios ?? []) as BackupSections["portfolios"],
    rebalancingSessions: (sessions?.state.sessions ?? []) as BackupSections["rebalancingSessions"],
  };
}

async function ownIds(userId: string) {
  const { investments, portfolios, rebalancingSessions } = await stored(userId);
  return new Set([...investments, ...portfolios, ...rebalancingSessions].map((r) => r.id));
}

async function importFile(userId: string, file: unknown) {
  const parsed = parseBackup(JSON.parse(JSON.stringify(file)));
  if (!parsed.ok) throw new Error("invalid backup");
  const { data } = await resolveBackupIds(parsed, userId, { fetchOwnIds: () => ownIds(userId) });
  await upload(userId, data);
}

/** id 를 뺀 내용과 연결. */
function contents({ investments, portfolios, rebalancingSessions }: BackupSections) {
  const accountName = (id: string) => investments.find((i) => i.id === id)?.accountName;
  return {
    accounts: investments.map((i) => [
      i.accountName,
      i.holdings.map((h) => [h.ticker, h.quantity]),
      i.cashItems.map((c) => [c.label, c.amount]),
    ]),
    portfolios: portfolios.map((p) => [
      p.name,
      p.accountIds.map(accountName),
      p.allocations.map((a) => [a.ticker, a.targetPercent]),
    ]),
    sessions: rebalancingSessions.map((s) => [
      accountName(s.accountId),
      portfolios.find((p) => p.id === s.portfolioId)?.name,
    ]),
  };
}

it.each([
  { kind: "a tagged", tagged: true },
  { kind: "an old untagged", tagged: false },
])("lets a user upload $kind backup exported from another account", async ({ tagged }) => {
  const owner = await createTestUser();
  const importer = await createTestUser();
  await upload(owner, newAccountData());
  const before = await stored(owner);
  const { accountTag, ...untagged } = buildBackup(before, await backupAccountTag(owner));

  await importFile(importer, tagged ? { ...untagged, accountTag } : untagged);

  expect(contents(await stored(importer))).toEqual(contents(before));
  expect(await stored(owner)).toEqual(before);
});

it.each([
  { kind: "a tagged", tagged: true },
  { kind: "an old untagged", tagged: false },
])("keeps the ids when the same user restores $kind backup", async ({ tagged }) => {
  const owner = await createTestUser();
  await upload(owner, newAccountData());
  const before = await stored(owner);
  const { accountTag, ...untagged } = buildBackup(before, await backupAccountTag(owner));

  await importFile(owner, tagged ? { ...untagged, accountTag } : untagged);

  // 저장 시각은 다시 저장할 때마다 바뀐다.
  const anyTime = { updatedAt: expect.any(String) };
  expect(await stored(owner)).toEqual({
    ...before,
    portfolios: before.portfolios.map((p) => ({ ...p, ...anyTime })),
  });
});
