import { db } from "@seedbook/database";
import { TRANSLATORS } from "@web/app/api/storage/_translators";
import { resolveUserId } from "@web/lib/auth-server";
import { canViewData } from "@web/lib/sharing/authz";
import { isCloudStoreKey } from "@web/lib/storage-mode";

/**
 * 공유받은 사용자의 데이터를 읽기 전용으로 조회하는 엔드포인트.
 *
 * `GET /api/sharing/view/[ownerId]/storage/[key]` →
 *   - viewer 가 ownerId 에 대해 유효한 DataShareAcceptance 를 가지고 있으면
 *     해당 도메인의 envelope 를 반환한다.
 *   - 그렇지 않으면 403.
 *
 * 의도적으로 PUT / DELETE 는 제공하지 않는다 — 공유는 읽기 전용.
 */

type RouteContext = {
  params: Promise<{ ownerId: string; key: string }>;
};

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const { ownerId, key } = await context.params;
  if (!isCloudStoreKey(key)) {
    return Response.json({ error: "invalid store key" }, { status: 400 });
  }

  const viewerUserId = await resolveUserId(request);
  if (!viewerUserId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const allowed = await canViewData(viewerUserId, ownerId);
  if (!allowed) return Response.json({ error: "forbidden" }, { status: 403 });

  const translator = TRANSLATORS[key];
  const envelope = await translator.read(db, ownerId);

  return Response.json({
    data: envelope,
    updatedAt: null,
  });
}
