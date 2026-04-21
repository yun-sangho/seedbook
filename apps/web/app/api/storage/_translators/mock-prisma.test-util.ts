/**
 * Prisma mock 유틸.
 *
 * 메모리 기반 Map 으로 Prisma 의 findMany / findUnique / upsert / deleteMany /
 * createMany / $transaction 을 흉내낸다. 정규화된 translator 의 round-trip 테스트
 * 용도 — 실제 Postgres 에 연결하지 않고도 envelope ↔ row 변환 정합성을 검증.
 */

import type { Prisma } from "./types";

type Row = Record<string, unknown>;

class InMemoryTable {
  private rows: Row[] = [];
  private pkFields: string[];

  constructor(pkFields: string[]) {
    this.pkFields = pkFields;
  }

  findMany(args?: { where?: Row; include?: Row; select?: Row; orderBy?: unknown }): Row[] {
    if (!args?.where) return [...this.rows];
    return this.rows.filter((row) => matchesWhere(row, args.where!));
  }

  findUnique(args: { where: Row; select?: Row }): Row | null {
    const flatWhere = flattenCompositeWhere(args.where);
    return this.rows.find((row) => matchesWhere(row, flatWhere)) ?? null;
  }

  upsert(args: { where: Row; create: Row; update: Row }): Row {
    const flatWhere = flattenCompositeWhere(args.where);
    const idx = this.rows.findIndex((row) => matchesWhere(row, flatWhere));
    if (idx >= 0) {
      this.rows[idx] = { ...this.rows[idx], ...args.update };
      return this.rows[idx]!;
    }
    this.rows.push({ ...args.create });
    return args.create;
  }

  deleteMany(args?: { where?: Row }): { count: number } {
    if (!args?.where) {
      const count = this.rows.length;
      this.rows = [];
      return { count };
    }
    const before = this.rows.length;
    this.rows = this.rows.filter((row) => !matchesWhere(row, args.where!));
    return { count: before - this.rows.length };
  }

  createMany(args: { data: Row[]; skipDuplicates?: boolean }): { count: number } {
    for (const row of args.data) {
      const pk = this.pkFields.map((f) => row[f]);
      const exists = this.rows.some((existing) =>
        this.pkFields.every((f, i) => String(existing[f]) === String(pk[i]))
      );
      if (exists && args.skipDuplicates) continue;
      this.rows.push({ ...row });
    }
    return { count: args.data.length };
  }

  getAll(): Row[] {
    return [...this.rows];
  }

  clear(): void {
    this.rows = [];
  }
}

/** Prisma 의 composite where 키를 flatten 한다. e.g. { userId_key: { userId, key } } → { userId, key } */
function flattenCompositeWhere(where: Row): Row {
  const flat: Row = {};
  for (const [key, value] of Object.entries(where)) {
    if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
      Object.assign(flat, value);
    } else {
      flat[key] = value;
    }
  }
  return flat;
}

function matchesWhere(row: Row, where: Row): boolean {
  for (const [key, value] of Object.entries(where)) {
    if (value && typeof value === "object" && "in" in value) {
      const arr = (value as { in: unknown[] }).in;
      if (!arr.includes(row[key])) return false;
    } else if (value && typeof value === "object" && "notIn" in value) {
      const arr = (value as { notIn: unknown[] }).notIn;
      if (arr.includes(row[key])) return false;
    } else if (String(row[key]) !== String(value)) {
      return false;
    }
  }
  return true;
}

/**
 * 테스트용 mock Prisma 인스턴스를 만든다.
 */
export function createMockPrisma() {
  const tables = {
    investmentAccount: new InMemoryTable(["id"]),
    investmentRecord: new InMemoryTable(["accountId", "date"]),
    stockHolding: new InMemoryTable(["id"]),
    cashItem: new InMemoryTable(["id"]),
    savingsAccount: new InMemoryTable(["id"]),
    savingsRecord: new InMemoryTable(["accountId", "date"]),
    debt: new InMemoryTable(["id"]),
    realAsset: new InMemoryTable(["id"]),
    realAssetCustomOwner: new InMemoryTable(["userId", "name"]),
    assetPlan: new InMemoryTable(["id"]),
    assetPlanAccountItem: new InMemoryTable(["planId", "accountId"]),
    assetProgressPoint: new InMemoryTable(["userId", "date"]),
    portfolio: new InMemoryTable(["id"]),
    portfolioAllocation: new InMemoryTable(["id"]),
    userPreference: new InMemoryTable(["userId"]),
    userListOrder: new InMemoryTable(["userId", "domain"]),
  };

  function makeDelegate(
    table: InMemoryTable,
    _includes?: Record<string, { table: InMemoryTable; fk: string; parentKey: string }>
  ) {
    return {
      findMany: async (args?: { where?: Row; include?: Row; select?: Row; orderBy?: unknown }) => {
        const rows = table.findMany(args);
        if (args?.include && _includes) {
          return rows.map((row) => {
            const enriched = { ...row };
            for (const [rel, conf] of Object.entries(_includes)) {
              if (args.include![rel]) {
                enriched[rel] = conf.table.findMany({ where: { [conf.fk]: row[conf.parentKey] } });
              }
            }
            return enriched;
          });
        }
        return rows;
      },
      findUnique: async (args: unknown) => table.findUnique(args as never),
      upsert: async (args: unknown) => table.upsert(args as never),
      deleteMany: async (args?: unknown) => table.deleteMany(args as never),
      createMany: async (args: unknown) => table.createMany(args as never),
    };
  }

  const mock = {
    investmentAccount: makeDelegate(tables.investmentAccount, {
      records: { table: tables.investmentRecord, fk: "accountId", parentKey: "id" },
      holdings: { table: tables.stockHolding, fk: "accountId", parentKey: "id" },
      cashItems: { table: tables.cashItem, fk: "accountId", parentKey: "id" },
    }),
    investmentRecord: makeDelegate(tables.investmentRecord),
    stockHolding: makeDelegate(tables.stockHolding),
    cashItem: makeDelegate(tables.cashItem),
    savingsAccount: makeDelegate(tables.savingsAccount, {
      records: { table: tables.savingsRecord, fk: "accountId", parentKey: "id" },
    }),
    savingsRecord: makeDelegate(tables.savingsRecord),
    debt: makeDelegate(tables.debt),
    realAsset: makeDelegate(tables.realAsset),
    realAssetCustomOwner: makeDelegate(tables.realAssetCustomOwner),
    assetPlan: makeDelegate(tables.assetPlan, {
      accountItems: { table: tables.assetPlanAccountItem, fk: "planId", parentKey: "id" },
    }),
    assetPlanAccountItem: makeDelegate(tables.assetPlanAccountItem),
    assetProgressPoint: makeDelegate(tables.assetProgressPoint),
    portfolio: makeDelegate(tables.portfolio, {
      allocations: { table: tables.portfolioAllocation, fk: "portfolioId", parentKey: "id" },
    }),
    portfolioAllocation: makeDelegate(tables.portfolioAllocation),
    userPreference: makeDelegate(tables.userPreference),
    userListOrder: makeDelegate(tables.userListOrder),
    // $transaction: 콜백을 mock 에 직접 넘겨서 실행. 롤백은 구현하지 않음.
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(mock),
  } as unknown as Prisma;

  return { mock, tables };
}
