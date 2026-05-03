import { schema } from "@seedbook/database";
import { asc, eq } from "drizzle-orm";
import {
  bigIntToNumber,
  formatDate,
  parseDate,
  toBigInt,
  type DomainTranslator,
  type Envelope,
} from "./types";

const VERSION = 1;

type ProgressPointPayload = {
  date: string;
  totalAssets: number;
  netAssets: number;
  investments: number;
  savings: number;
  realAssets: number;
  loans: number;
};

export const progressTranslator: DomainTranslator = {
  async read(db, userId) {
    const points = await db
      .select()
      .from(schema.assetProgressPoint)
      .where(eq(schema.assetProgressPoint.userId, userId))
      .orderBy(asc(schema.assetProgressPoint.date));

    if (points.length === 0) return null;

    const progressPoints: ProgressPointPayload[] = points.map((p) => ({
      date: formatDate(p.date),
      totalAssets: bigIntToNumber(p.totalAssets),
      netAssets: bigIntToNumber(p.netAssets),
      investments: bigIntToNumber(p.investments),
      savings: bigIntToNumber(p.savings),
      realAssets: bigIntToNumber(p.realAssets),
      loans: bigIntToNumber(p.loans),
    }));

    const envelope: Envelope = {
      state: { progressPoints },
      version: VERSION,
    };
    return envelope;
  },

  async write(db, userId, envelope) {
    const state = envelope.state ?? {};
    const progressPoints = Array.isArray(state.progressPoints)
      ? (state.progressPoints as ProgressPointPayload[])
      : [];

    await db.transaction(async (tx) => {
      // Progress 는 (userId, date) 복합 PK. 전체 교체가 가장 단순.
      await tx
        .delete(schema.assetProgressPoint)
        .where(eq(schema.assetProgressPoint.userId, userId));
      const rows = progressPoints
        .map((p) => {
          const date = parseDate(p.date);
          if (!date) return null;
          return {
            userId,
            date,
            totalAssets: toBigInt(p.totalAssets),
            netAssets: toBigInt(p.netAssets),
            investments: toBigInt(p.investments),
            savings: toBigInt(p.savings),
            realAssets: toBigInt(p.realAssets),
            loans: toBigInt(p.loans),
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);
      if (rows.length > 0) {
        await tx.insert(schema.assetProgressPoint).values(rows).onConflictDoNothing();
      }
    });
  },
};
