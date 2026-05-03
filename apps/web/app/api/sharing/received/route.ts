import { db, schema } from "@seedbook/database";
import { and, desc, eq, isNull } from "drizzle-orm";
import { resolveUserId } from "@web/lib/auth-server";

/**
 * 내가 수락한 공유 목록 (= 내가 다른 사람 데이터를 볼 수 있는 권한) 반환.
 * 소유자가 revoke 한 공유는 자동으로 제외된다.
 */

export async function GET(request: Request): Promise<Response> {
  const userId = await resolveUserId(request);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const rows = await db
    .select({
      acceptanceId: schema.dataShareAcceptance.id,
      shareId: schema.dataShareAcceptance.shareId,
      acceptedAt: schema.dataShareAcceptance.acceptedAt,
      label: schema.dataShare.label,
      ownerId: schema.user.id,
      ownerName: schema.user.name,
      ownerImage: schema.user.image,
    })
    .from(schema.dataShareAcceptance)
    .innerJoin(schema.dataShare, eq(schema.dataShareAcceptance.shareId, schema.dataShare.id))
    .innerJoin(schema.user, eq(schema.dataShare.ownerUserId, schema.user.id))
    .where(
      and(
        eq(schema.dataShareAcceptance.recipientUserId, userId),
        isNull(schema.dataShare.revokedAt),
      ),
    )
    .orderBy(desc(schema.dataShareAcceptance.acceptedAt));

  return Response.json({
    received: rows.map((r) => ({
      id: r.acceptanceId,
      shareId: r.shareId,
      acceptedAt: r.acceptedAt.toISOString(),
      label: r.label,
      owner: {
        id: r.ownerId,
        name: r.ownerName,
        image: r.ownerImage,
      },
    })),
  });
}
