import { db, schema } from "@seedbook/database";
import { eq } from "drizzle-orm";
import { resolveUserId } from "@web/lib/auth-server";

/**
 * 소유자가 특정 수락자의 접근을 제거(강제 퇴장) 한다. 공유 자체는 유지되므로
 * 같은 수신자가 다시 코드를 입력하면 재수락이 가능하다.
 */

type RouteContext = {
  params: Promise<{ id: string; acceptanceId: string }>;
};

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  const { id, acceptanceId } = await context.params;
  const userId = await resolveUserId(request);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const acceptance = await db.query.dataShareAcceptance.findFirst({
    where: (t, { eq }) => eq(t.id, acceptanceId),
    with: { share: true },
  });
  if (!acceptance || acceptance.shareId !== id || acceptance.share.ownerUserId !== userId) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  await db
    .delete(schema.dataShareAcceptance)
    .where(eq(schema.dataShareAcceptance.id, acceptanceId));
  return Response.json({ ok: true });
}
