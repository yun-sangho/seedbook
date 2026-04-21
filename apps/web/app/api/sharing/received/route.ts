import { prisma } from "@seedbook/database";
import { resolveUserId } from "@web/lib/auth-server";

/**
 * 내가 수락한 공유 목록 (= 내가 다른 사람 데이터를 볼 수 있는 권한) 반환.
 * 소유자가 revoke 한 공유는 자동으로 제외된다.
 */

export async function GET(request: Request): Promise<Response> {
  const userId = await resolveUserId(request);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const acceptances = await prisma.dataShareAcceptance.findMany({
    where: {
      recipientUserId: userId,
      share: { revokedAt: null },
    },
    include: {
      share: {
        include: {
          owner: { select: { id: true, name: true, image: true } },
        },
      },
    },
    orderBy: { acceptedAt: "desc" },
  });

  return Response.json({
    received: acceptances.map((a) => ({
      id: a.id,
      shareId: a.shareId,
      acceptedAt: a.acceptedAt.toISOString(),
      label: a.share.label,
      owner: {
        id: a.share.owner.id,
        name: a.share.owner.name,
        image: a.share.owner.image,
      },
    })),
  });
}
