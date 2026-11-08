import { schema } from "@seedbook/database";
import { and, eq, notInArray } from "drizzle-orm";
import { assertNoForeignRows } from "./ownership";
import {
  bigIntToNumber,
  formatDate,
  parseDate,
  toBigInt,
  type DomainTranslator,
  type Envelope,
} from "./types";

const DOMAIN = "real-assets";
const VERSION = 2;

type RealAssetPayload = {
  id: string;
  assetName: string;
  assetType: string;
  currentValue: number;
  purchaseValue: number;
  purchaseDate?: string;
  note?: string;
  color: string;
};

export const realAssetsTranslator: DomainTranslator = {
  async read(db, userId) {
    const [assets, listOrder] = await Promise.all([
      db.query.realAsset.findMany({ where: (t, { eq }) => eq(t.userId, userId) }),
      db.query.userListOrder.findFirst({
        where: (t, { and, eq }) => and(eq(t.userId, userId), eq(t.domain, DOMAIN)),
      }),
    ]);

    if (assets.length === 0 && !listOrder) return null;

    const orderIndex = new Map<string, number>();
    (listOrder?.order ?? []).forEach((id, idx) => orderIndex.set(id, idx));
    const sorted = assets.slice().sort((a, b) => {
      const ai = orderIndex.has(a.id) ? orderIndex.get(a.id)! : Number.MAX_SAFE_INTEGER;
      const bi = orderIndex.has(b.id) ? orderIndex.get(b.id)! : Number.MAX_SAFE_INTEGER;
      return ai - bi;
    });

    const realAssets = sorted.map((a) => ({
      id: a.id,
      assetName: a.assetName,
      assetType: a.assetType,
      currentValue: bigIntToNumber(a.currentValue),
      purchaseValue: bigIntToNumber(a.purchaseValue),
      purchaseDate: a.purchaseDate ? formatDate(a.purchaseDate) : "",
      note: a.note,
      color: a.color,
    }));

    const envelope: Envelope = {
      state: { realAssets },
      version: VERSION,
    };
    return envelope;
  },

  async write(db, userId, envelope) {
    const state = envelope.state ?? {};
    const realAssets = Array.isArray(state.realAssets)
      ? (state.realAssets as RealAssetPayload[])
      : [];

    await db.transaction(async (tx) => {
      // 다른 사용자의 id 를 재사용한 envelope 는 아무것도 쓰기 전에 거부한다.
      await assertNoForeignRows(
        tx,
        schema.realAsset,
        realAssets.map((a) => a.id),
        userId
      );

      const order = realAssets.map((a) => a.id);
      await tx
        .insert(schema.userListOrder)
        .values({ userId, domain: DOMAIN, order })
        .onConflictDoUpdate({
          target: [schema.userListOrder.userId, schema.userListOrder.domain],
          set: { order },
        });

      const incomingIds = realAssets.map((a) => a.id);
      if (incomingIds.length > 0) {
        await tx
          .delete(schema.realAsset)
          .where(
            and(eq(schema.realAsset.userId, userId), notInArray(schema.realAsset.id, incomingIds))
          );
      } else {
        await tx.delete(schema.realAsset).where(eq(schema.realAsset.userId, userId));
      }

      const now = new Date();
      for (const a of realAssets) {
        const purchaseDate = a.purchaseDate ? parseDate(a.purchaseDate) : null;
        await tx
          .insert(schema.realAsset)
          .values({
            id: a.id,
            userId,
            assetName: a.assetName,
            assetType: a.assetType,
            currentValue: toBigInt(a.currentValue),
            purchaseValue: toBigInt(a.purchaseValue),
            purchaseDate,
            note: a.note ?? "",
            color: a.color,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: schema.realAsset.id,
            // 방어적: 남의 행이면 갱신하지 않는다 (assertNoForeignRows 가 먼저 막음).
            where: eq(schema.realAsset.userId, userId),
            set: {
              assetName: a.assetName,
              assetType: a.assetType,
              currentValue: toBigInt(a.currentValue),
              purchaseValue: toBigInt(a.purchaseValue),
              purchaseDate,
              note: a.note ?? "",
              color: a.color,
              updatedAt: now,
            },
          });
      }
    });
  },
};
