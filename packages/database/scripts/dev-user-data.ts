/**
 * dev 사용자의 테스트 시나리오 데이터 (`seed-data/user-data.json`) 를 DB 에 넣는다.
 *
 * 픽스처는 관리 화면 백업 2.0 모양 ({ investments, portfolios, rebalancingSessions }) 이라
 * 같은 파일을 관리 화면 "데모 데이터" (`apps/web/public/seed-data/user-data.json`) 로도 쓴다.
 * 두 파일은 같아야 한다.
 *
 * - `seedDevUserData` (seed.ts): dev 사용자에게 계좌·포트폴리오가 하나도 없을 때만 넣는다.
 *   이미 데이터가 있으면 섞이지 않게 건드리지 않는다.
 * - `resetDevUserData` (reset-dev-user.ts): 지금 데이터를 지우고 시나리오로 되돌린다.
 *   동기화되는 엔티티(계좌·포트폴리오·리밸런싱)는 지우지 않고 톰스톤으로 남겨, cloud 모드
 *   브라우저가 다음 pull 에서 삭제와 새 데이터를 함께 받아 가게 한다.
 */

import { existsSync, readFileSync } from "node:fs";
import path, { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq, isNull, notInArray, sql } from "drizzle-orm";
import { db, schema } from "../src/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(__dirname, "../seed-data/user-data.json");

type InvestmentFixture = {
  id: string;
  accountName: string;
  accountType: string;
  currency: string;
  initialInvestment: number;
  currentValue: number;
  note?: string;
  color: string;
  sellCostPercent?: number;
  records?: { date: string; initialInvestment: number; currentValue: number }[];
  holdings?: {
    id: string;
    market: string;
    ticker: string;
    name: string;
    currency: string;
    quantity: number;
    memo?: string;
  }[];
  cashItems?: { id: string; label: string; amount: number }[];
};

type PortfolioFixture = {
  id: string;
  name: string;
  color: string;
  note?: string;
  accountIds: string[];
  driftMode: "relative" | "absolute";
  driftThresholdPercent: number;
  allocations: {
    id: string;
    market: string;
    ticker: string;
    name: string;
    currency: string;
    targetPercent: number;
  }[];
};

type UserDataFixture = {
  investments?: InvestmentFixture[];
  portfolios?: PortfolioFixture[];
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function readFixture(): UserDataFixture | null {
  if (!existsSync(FIXTURE_PATH)) {
    console.log(`[seed] no user-data fixture at ${FIXTURE_PATH}, skipping`);
    return null;
  }
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as UserDataFixture;
}

/** 계좌 id → 연결된 포트폴리오 id. 한 계좌는 하나의 포트폴리오에만 연결된다. */
function portfolioOfAccount(portfolios: PortfolioFixture[]): Map<string, string> {
  const links = new Map<string, string>();
  for (const p of portfolios) {
    for (const accountId of p.accountIds) {
      if (links.has(accountId)) {
        throw new Error(`[seed] account ${accountId} is linked to more than one portfolio`);
      }
      links.set(accountId, p.id);
    }
  }
  return links;
}

/**
 * 픽스처의 계좌·포트폴리오를 쓴다. 같은 id 의 행이 (톰스톤이어도) 있으면 되살려 덮어쓰고,
 * 딸린 행(기록·보유 종목·예수금·비중)은 픽스처대로 바꾼다. `version` 을 올리고 `updatedAt`
 * 을 지금으로 두어 엔티티 동기화 pull 이 바뀐 것으로 받아 가게 한다.
 */
async function writeFixture(tx: Tx, userId: string, fixture: UserDataFixture, now: Date) {
  const investments = fixture.investments ?? [];
  const portfolios = fixture.portfolios ?? [];
  const links = portfolioOfAccount(portfolios);
  const revive = (table: typeof schema.investmentAccount | typeof schema.portfolio) => ({
    deletedAt: null,
    updatedAt: now,
    version: sql`${table.version} + 1`,
  });

  // 계좌가 portfolioId 로 포트폴리오를 가리키므로 포트폴리오를 먼저 쓴다.
  for (const p of portfolios) {
    const values = {
      name: p.name,
      color: p.color,
      note: p.note ?? "",
      accountIds: p.accountIds,
      driftMode: p.driftMode,
      driftThresholdPercent: p.driftThresholdPercent,
    };
    await tx
      .insert(schema.portfolio)
      .values({ id: p.id, userId, ...values, updatedAt: now })
      .onConflictDoUpdate({
        target: schema.portfolio.id,
        set: { ...values, ...revive(schema.portfolio) },
      });
    await tx
      .delete(schema.portfolioAllocation)
      .where(eq(schema.portfolioAllocation.portfolioId, p.id));
    if (p.allocations.length > 0) {
      await tx
        .insert(schema.portfolioAllocation)
        .values(p.allocations.map((a) => ({ ...a, portfolioId: p.id })));
    }
  }

  for (const inv of investments) {
    const values = {
      accountName: inv.accountName,
      accountType: inv.accountType,
      currency: inv.currency,
      initialInvestment: BigInt(inv.initialInvestment),
      currentValue: BigInt(inv.currentValue),
      note: inv.note ?? "",
      color: inv.color,
      sellCostPercent: inv.sellCostPercent ?? 0,
      portfolioId: links.get(inv.id) ?? null,
    };
    await tx
      .insert(schema.investmentAccount)
      .values({ id: inv.id, userId, ...values, updatedAt: now })
      .onConflictDoUpdate({
        target: schema.investmentAccount.id,
        set: { ...values, ...revive(schema.investmentAccount) },
      });

    await tx.delete(schema.investmentRecord).where(eq(schema.investmentRecord.accountId, inv.id));
    await tx.delete(schema.stockHolding).where(eq(schema.stockHolding.accountId, inv.id));
    await tx.delete(schema.cashItem).where(eq(schema.cashItem.accountId, inv.id));

    const records = inv.records ?? [];
    if (records.length > 0) {
      await tx.insert(schema.investmentRecord).values(
        records.map((r) => ({
          accountId: inv.id,
          date: new Date(r.date),
          initialInvestment: BigInt(r.initialInvestment),
          currentValue: BigInt(r.currentValue),
        }))
      );
    }
    const holdings = inv.holdings ?? [];
    if (holdings.length > 0) {
      await tx
        .insert(schema.stockHolding)
        .values(holdings.map((h) => ({ ...h, accountId: inv.id, memo: h.memo ?? "" })));
    }
    const cashItems = inv.cashItems ?? [];
    if (cashItems.length > 0) {
      await tx.insert(schema.cashItem).values(
        cashItems.map((c) => ({
          id: c.id,
          accountId: inv.id,
          label: c.label,
          amount: BigInt(c.amount),
        }))
      );
    }
  }

  // 목록 순서는 픽스처 순서. 리밸런싱은 시나리오에 없으므로 비운다.
  const orders = [
    { domain: "investment-accounts", order: investments.map((i) => i.id) },
    { domain: "portfolios", order: portfolios.map((p) => p.id) },
    { domain: "rebalancings", order: [] as string[] },
  ];
  for (const { domain, order } of orders) {
    await tx
      .insert(schema.userListOrder)
      .values({ userId, domain, order, updatedAt: now })
      .onConflictDoUpdate({
        target: [schema.userListOrder.userId, schema.userListOrder.domain],
        set: { order, updatedAt: now },
      });
  }

  return { investments: investments.length, portfolios: portfolios.length };
}

/** 계좌·포트폴리오가 하나도 없을 때만 시나리오를 넣는다 (dev DB 를 처음 만들 때). */
export async function seedDevUserData(userId: string): Promise<void> {
  const fixture = readFixture();
  if (!fixture) return;

  const [account, portfolio] = await Promise.all([
    db.query.investmentAccount.findFirst({ where: (t, { eq }) => eq(t.userId, userId) }),
    db.query.portfolio.findFirst({ where: (t, { eq }) => eq(t.userId, userId) }),
  ]);
  if (account || portfolio) {
    console.log("[seed] user-data: dev user already has data, skipping (db:seed:reset to replace)");
    return;
  }

  const counts = await db.transaction((tx) => writeFixture(tx, userId, fixture, new Date()));
  console.log(
    `[seed] user-data: investments=${counts.investments}, portfolios=${counts.portfolios}`
  );
}

/**
 * dev 사용자의 데이터를 시나리오로 되돌린다.
 *
 * - 픽스처에 없는 계좌·포트폴리오와 모든 리밸런싱 → 톰스톤 (동기화로 다른 기기에도 지워진다).
 * - 픽스처의 계좌·포트폴리오 → 되살려 덮어쓴다.
 * - 개인 설정(정렬·접힘·저장소 모드)과, 서비스에서 빠진 도메인(저축·대출·실물자산·자산 기록·
 *   자산 계획)의 행은 지운다.
 */
export async function resetDevUserData(userId: string): Promise<void> {
  const fixture = readFixture();
  if (!fixture) return;
  const accountIds = (fixture.investments ?? []).map((i) => i.id);
  const portfolioIds = (fixture.portfolios ?? []).map((p) => p.id);

  const counts = await db.transaction(async (tx) => {
    const now = new Date();
    const tombstone = (table: typeof schema.investmentAccount | typeof schema.portfolio) => ({
      deletedAt: now,
      updatedAt: now,
      version: sql`${table.version} + 1`,
    });

    await tx
      .update(schema.rebalancing)
      .set({ deletedAt: now, updatedAt: now, version: sql`${schema.rebalancing.version} + 1` })
      .where(and(eq(schema.rebalancing.userId, userId), isNull(schema.rebalancing.deletedAt)));
    // 계좌가 먼저 포트폴리오를 놓아야 지워질 포트폴리오를 가리키지 않는다.
    await tx
      .update(schema.investmentAccount)
      .set({ ...tombstone(schema.investmentAccount), portfolioId: null })
      .where(
        and(
          eq(schema.investmentAccount.userId, userId),
          isNull(schema.investmentAccount.deletedAt),
          accountIds.length > 0 ? notInArray(schema.investmentAccount.id, accountIds) : undefined
        )
      );
    await tx
      .update(schema.portfolio)
      .set({ ...tombstone(schema.portfolio), accountIds: [] })
      .where(
        and(
          eq(schema.portfolio.userId, userId),
          isNull(schema.portfolio.deletedAt),
          portfolioIds.length > 0 ? notInArray(schema.portfolio.id, portfolioIds) : undefined
        )
      );

    await tx.delete(schema.userPreference).where(eq(schema.userPreference.userId, userId));
    await tx.delete(schema.savingsAccount).where(eq(schema.savingsAccount.userId, userId));
    await tx.delete(schema.debt).where(eq(schema.debt.userId, userId));
    await tx.delete(schema.realAsset).where(eq(schema.realAsset.userId, userId));
    await tx.delete(schema.assetProgressPoint).where(eq(schema.assetProgressPoint.userId, userId));
    await tx.delete(schema.assetPlan).where(eq(schema.assetPlan.userId, userId));
    await tx
      .delete(schema.userListOrder)
      .where(
        and(
          eq(schema.userListOrder.userId, userId),
          notInArray(schema.userListOrder.domain, [
            "investment-accounts",
            "portfolios",
            "rebalancings",
          ])
        )
      );

    return writeFixture(tx, userId, fixture, now);
  });

  console.log(
    `[reset] dev user data reset: investments=${counts.investments}, portfolios=${counts.portfolios}`
  );
}
