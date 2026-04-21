import { prisma } from "@seedbook/database";
import { resolveUserId } from "@web/lib/auth-server";

/**
 * 수신자가 공유 코드를 입력해 수락한다.
 *
 * 요청: `{ code: string }`
 * 응답:
 *   - 200 `{ acceptance: {...} }` 성공 (이미 수락한 경우에도 idempotent)
 *   - 400 잘못된 요청
 *   - 401 로그인 필요
 *   - 404 유효하지 않거나 취소된 코드
 *   - 409 본인 소유의 코드
 */

export async function POST(request: Request): Promise<Response> {
  const userId = await resolveUserId(request);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const rawCode =
    body && typeof body === "object" && "code" in body
      ? (body as { code: unknown }).code
      : undefined;
  if (typeof rawCode !== "string" || rawCode.trim().length === 0) {
    return Response.json({ error: "code required" }, { status: 400 });
  }
  const code = rawCode.trim();

  const share = await prisma.dataShare.findUnique({
    where: { code },
    include: { owner: { select: { id: true, name: true, image: true } } },
  });
  if (!share || share.revokedAt !== null) {
    return Response.json({ error: "invalid code" }, { status: 404 });
  }
  if (share.ownerUserId === userId) {
    return Response.json({ error: "cannot accept your own share" }, { status: 409 });
  }

  // upsert: 이미 수락한 건은 그대로 두고 응답만 내려준다 (idempotent).
  const acceptance = await prisma.dataShareAcceptance.upsert({
    where: { shareId_recipientUserId: { shareId: share.id, recipientUserId: userId } },
    create: { shareId: share.id, recipientUserId: userId },
    update: {},
  });

  return Response.json({
    acceptance: {
      id: acceptance.id,
      shareId: acceptance.shareId,
      acceptedAt: acceptance.acceptedAt.toISOString(),
      label: share.label,
      owner: {
        id: share.owner.id,
        name: share.owner.name,
        image: share.owner.image,
      },
    },
  });
}
