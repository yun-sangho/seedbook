import { db } from "@seedbook/database";
import { isRebalancingTaskSort } from "@web/features/rebalancing/utils/sort-rebalancing-tasks";
import { resolveUserId } from "@web/lib/auth-server";
import {
  readRebalancingTaskSort,
  writeRebalancingTaskSort,
} from "@web/server/preferences/preferences";

/**
 * 사용자 개인 설정을 읽고 쓰는 엔드포인트. 저장소 모드(local/cloud)와 상관없이 계정에 저장한다.
 * 지금은 진행 중 리밸런싱의 매매 정렬(`rebalancingTaskSort`)만 다룬다.
 */

function unauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

export async function GET(request: Request): Promise<Response> {
  const userId = await resolveUserId(request);
  if (!userId) return unauthorized();

  return Response.json({ rebalancingTaskSort: await readRebalancingTaskSort(db, userId) });
}

export async function PUT(request: Request): Promise<Response> {
  const userId = await resolveUserId(request);
  if (!userId) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const sort = (body as { rebalancingTaskSort?: unknown })?.rebalancingTaskSort;
  if (!isRebalancingTaskSort(sort)) {
    return Response.json({ error: "invalid rebalancingTaskSort" }, { status: 400 });
  }

  await writeRebalancingTaskSort(db, userId, sort);
  return Response.json({ ok: true, rebalancingTaskSort: sort });
}
