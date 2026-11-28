import { db } from "@seedbook/database";
import { resolveUserId } from "@web/lib/auth-server";
import { handlePull } from "@web/server/sync/v2/pull";

/** 동기화 v2 읽기 (설계 §4.3). 로직은 `handlePull` — 이 라우트는 의존성만 넘긴다. */
export function GET(request: Request): Promise<Response> {
  return handlePull(request, { db, resolveUserId });
}
