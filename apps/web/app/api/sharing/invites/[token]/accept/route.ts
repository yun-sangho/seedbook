import { db, schema } from "@seedbook/database";
import { and, eq, isNull } from "drizzle-orm";
import { resolveUserId } from "@web/lib/auth-server";

/**
 * 인증된 사용자가 초대 토큰을 소비해 공유를 수락한다.
 *
 * 동시성: 두 사용자가 같은 1회용 링크를 동시에 클릭해도 단 한 명만 acceptance
 * 를 받도록 한다. 그러기 위해 (a) 먼저 invite 행을 원자적으로 "claim" 하고
 * (b) claim 에 성공한 사용자만 acceptance 를 upsert 한다.
 *
 * 응답:
 *   - 200 정상 (이미 같은 사용자가 받은 경우 멱등)
 *   - 401 미인증
 *   - 404 토큰 없음
 *   - 409 본인 소유 공유
 *   - 410 만료/취소/타인이 이미 소비
 */

type RouteContext = {
  params: Promise<{ token: string }>;
};

async function fetchInvite(token: string) {
  return db.query.dataShareInvite.findFirst({
    where: (t, { eq }) => eq(t.token, token),
    with: {
      share: {
        with: {
          owner: { columns: { id: true, name: true, image: true } },
        },
      },
    },
  });
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { token } = await context.params;
  const userId = await resolveUserId(request);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const invite = await fetchInvite(token);
  if (!invite) return Response.json({ error: "not found" }, { status: 404 });
  if (invite.share.revokedAt !== null) {
    return Response.json({ error: "share revoked" }, { status: 410 });
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    return Response.json({ error: "expired" }, { status: 410 });
  }
  if (invite.share.ownerUserId === userId) {
    return Response.json({ error: "cannot accept your own share" }, { status: 409 });
  }

  // 동일 사용자 멱등 경로: 이미 같은 사용자가 소비한 토큰이면 acceptance 를
  // 다시 upsert 만 하고 반환.
  if (invite.consumedAt !== null && invite.consumedByUserId === userId) {
    return finalize(invite, userId);
  }
  if (invite.consumedAt !== null) {
    return Response.json({ error: "already consumed" }, { status: 410 });
  }

  // 원자적 claim — UPDATE ... WHERE consumedAt IS NULL RETURNING. 단 한
  // 트랜잭션만 1행을 받는다. 동시 클릭한 다른 사용자는 0행을 받고 410.
  const claimed = await db
    .update(schema.dataShareInvite)
    .set({ consumedAt: new Date(), consumedByUserId: userId })
    .where(
      and(eq(schema.dataShareInvite.id, invite.id), isNull(schema.dataShareInvite.consumedAt)),
    )
    .returning({ id: schema.dataShareInvite.id });

  if (claimed.length === 0) {
    return Response.json({ error: "already consumed" }, { status: 410 });
  }

  return finalize(invite, userId);
}

async function finalize(
  invite: NonNullable<Awaited<ReturnType<typeof fetchInvite>>>,
  userId: string,
): Promise<Response> {
  const [acceptance] = await db
    .insert(schema.dataShareAcceptance)
    .values({ shareId: invite.shareId, recipientUserId: userId })
    .onConflictDoUpdate({
      target: [schema.dataShareAcceptance.shareId, schema.dataShareAcceptance.recipientUserId],
      set: { shareId: invite.shareId },
    })
    .returning();

  if (!acceptance) {
    return Response.json({ error: "failed to accept" }, { status: 500 });
  }

  return Response.json({
    acceptance: {
      id: acceptance.id,
      shareId: acceptance.shareId,
      acceptedAt: acceptance.acceptedAt.toISOString(),
      label: invite.share.label,
      owner: {
        id: invite.share.owner.id,
        name: invite.share.owner.name,
        image: invite.share.owner.image,
      },
    },
  });
}
