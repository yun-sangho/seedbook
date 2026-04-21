import { prisma } from "@seedbook/database";
import { resolveUserId } from "@web/lib/auth-server";

/**
 * 특정 공유 삭제(=완전 취소). 연결된 acceptances 는 cascade 로 함께 삭제.
 */

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  const userId = await resolveUserId(request);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const share = await prisma.dataShare.findUnique({ where: { id } });
  if (!share || share.ownerUserId !== userId) {
    // 없는 id 와 타인 소유를 구분하지 않고 404 로 묶음.
    return Response.json({ error: "not found" }, { status: 404 });
  }

  await prisma.dataShare.delete({ where: { id } });
  return Response.json({ ok: true });
}
