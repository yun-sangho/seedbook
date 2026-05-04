import { db } from "@seedbook/database";

/**
 * 초대 토큰 메타데이터 공개 조회. 랜딩 페이지가 SSR 로 호출해 소유자 정보·만료 여부를
 * 미리 보여주기 위한 용도. 토큰을 알고 있는 사람만 호출하므로 인증 불필요.
 *
 * 토큰 자체는 192 bits 엔트로피라 무차별 대입 안전.
 */

type RouteContext = {
  params: Promise<{ token: string }>;
};

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { token } = await context.params;

  const invite = await db.query.dataShareInvite.findFirst({
    where: (t, { eq }) => eq(t.token, token),
    with: {
      share: {
        with: {
          owner: { columns: { id: true, name: true, image: true } },
        },
      },
    },
  });

  if (!invite) return Response.json({ error: "not found" }, { status: 404 });
  if (invite.share.revokedAt !== null) {
    return Response.json({ error: "share revoked" }, { status: 410 });
  }

  const now = Date.now();
  const expired = invite.expiresAt.getTime() < now;
  const consumed = invite.consumedAt !== null;

  return Response.json({
    invite: {
      id: invite.id,
      label: invite.label,
      expiresAt: invite.expiresAt.toISOString(),
      consumedAt: invite.consumedAt?.toISOString() ?? null,
      expired,
      consumed,
      shareId: invite.shareId,
      owner: {
        id: invite.share.owner.id,
        name: invite.share.owner.name,
        image: invite.share.owner.image,
      },
    },
  });
}
