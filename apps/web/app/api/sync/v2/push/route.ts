import { db } from "@seedbook/database";
import { resolveUserId } from "@web/lib/auth-server";
import { handlePush } from "@web/server/sync/v2/push";

/** 동기화 v2 쓰기 (설계 §4.2). 로직은 `handlePush` — 이 라우트는 의존성만 넘긴다. */
export function POST(request: Request): Promise<Response> {
  return handlePush(request, { db, resolveUserId });
}
