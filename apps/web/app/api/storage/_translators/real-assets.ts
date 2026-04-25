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
  async read(prisma, userId) {
    const [assets, listOrder] = await Promise.all([
      prisma.realAsset.findMany({ where: { userId } }),
      prisma.userListOrder.findUnique({
        where: { userId_domain: { userId, domain: DOMAIN } },
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

  async write(prisma, userId, envelope) {
    const state = envelope.state ?? {};
    const realAssets = Array.isArray(state.realAssets)
      ? (state.realAssets as RealAssetPayload[])
      : [];

    await prisma.$transaction(async (tx) => {
      const order = realAssets.map((a) => a.id);
      await tx.userListOrder.upsert({
        where: { userId_domain: { userId, domain: DOMAIN } },
        create: { userId, domain: DOMAIN, order },
        update: { order },
      });

      const incomingIds = new Set(realAssets.map((a) => a.id));
      const existingIds = (
        await tx.realAsset.findMany({ where: { userId }, select: { id: true } })
      ).map((r) => r.id);
      const toDelete = existingIds.filter((id) => !incomingIds.has(id));
      if (toDelete.length > 0) {
        await tx.realAsset.deleteMany({ where: { id: { in: toDelete } } });
      }

      for (const a of realAssets) {
        const purchaseDate = a.purchaseDate ? parseDate(a.purchaseDate) : null;
        await tx.realAsset.upsert({
          where: { id: a.id },
          create: {
            id: a.id,
            userId,
            assetName: a.assetName,
            assetType: a.assetType,
            currentValue: toBigInt(a.currentValue),
            purchaseValue: toBigInt(a.purchaseValue),
            purchaseDate,
            note: a.note ?? "",
            color: a.color,
          },
          update: {
            assetName: a.assetName,
            assetType: a.assetType,
            currentValue: toBigInt(a.currentValue),
            purchaseValue: toBigInt(a.purchaseValue),
            purchaseDate,
            note: a.note ?? "",
            color: a.color,
          },
        });
      }
    });
  },
};
