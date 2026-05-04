import { db, schema } from "@seedbook/database";
import { and, eq } from "drizzle-orm";
import { resolveUserId } from "@web/lib/auth-server";

/**
 * 미사용 초대 토큰 취소(=삭제). 이미 소비된 초대도 같이 지울 수 있도록 둔다 —
 * 소비 이력은 acceptance 쪽에 남으므로 여기는 단순 정리 용도.
 */

type RouteContext = {
  params: Promise<{ id: string; inviteId: string }>;
};

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  const { id, inviteId } = await context.params;
  const userId = await resolveUserId(request);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const share = await db.query.dataShare.findFirst({
    where: (t, { eq }) => eq(t.id, id),
  });
  if (!share || share.ownerUserId !== userId) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const result = await db
    .delete(schema.dataShareInvite)
    .where(and(eq(schema.dataShareInvite.id, inviteId), eq(schema.dataShareInvite.shareId, id)))
    .returning({ id: schema.dataShareInvite.id });

  if (result.length === 0) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
