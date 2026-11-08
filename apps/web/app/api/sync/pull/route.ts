import { db } from "@seedbook/database";
import { resolveUserId } from "@web/lib/auth-server";
import { pullChanges } from "@web/server/sync/pull";

/**
 * 엔티티 단위 동기화 읽기. `?since=<이전 응답의 cursor>` 이후 바뀐 엔티티(톰스톤 포함)를,
 * since 가 없으면 살아 있는 전체를 돌려준다.
 */
export async function GET(request: Request): Promise<Response> {
  const userId = await resolveUserId(request);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const since = new URL(request.url).searchParams.get("since");
  if (since !== null && Number.isNaN(Date.parse(since))) {
    return Response.json({ error: "since must be an ISO timestamp" }, { status: 400 });
  }

  return Response.json(await pullChanges(db, userId, since));
}
