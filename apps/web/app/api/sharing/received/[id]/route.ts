import { db, schema } from "@seedbook/database";
import { eq } from "drizzle-orm";
import { resolveUserId } from "@web/lib/auth-server";

/**
 * 수신자가 자신의 수락을 스스로 해제(=나가기) 한다.
 */

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  const userId = await resolveUserId(request);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const acceptance = await db.query.dataShareAcceptance.findFirst({
    where: (t, { eq }) => eq(t.id, id),
  });
  if (!acceptance || acceptance.recipientUserId !== userId) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  await db.delete(schema.dataShareAcceptance).where(eq(schema.dataShareAcceptance.id, id));
  return Response.json({ ok: true });
}
