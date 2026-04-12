import {
  bigIntToNumber,
  type DomainTranslator,
  type Envelope,
  formatDate,
  parseDate,
  toBigInt,
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
  async read(prisma, userId) {
    const points = await prisma.assetProgressPoint.findMany({
      where: { userId },
      orderBy: { date: "asc" },
    });

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

  async write(prisma, userId, envelope) {
    const state = envelope.state ?? {};
    const progressPoints = Array.isArray(state.progressPoints)
      ? (state.progressPoints as ProgressPointPayload[])
      : [];

    await prisma.$transaction(async (tx) => {
      // Progress 는 (userId, date) 복합 PK. 전체 교체가 가장 단순.
      await tx.assetProgressPoint.deleteMany({ where: { userId } });
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
        await tx.assetProgressPoint.createMany({ data: rows, skipDuplicates: true });
      }
    });
  },
};
