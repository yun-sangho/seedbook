import { db } from "@seedbook/database";
import { parseCollapsedSections } from "@web/features/rebalancing/utils/collapsed-sections";
import { isRebalancingTaskSort } from "@web/features/rebalancing/utils/sort-rebalancing-tasks";
import { resolveUserId } from "@web/lib/auth-server";
import {
  readRebalancingCollapsedSections,
  readRebalancingTaskSort,
  writeRebalancingCollapsedSections,
  writeRebalancingTaskSort,
} from "@web/server/preferences/preferences";

/**
 * 사용자 개인 설정을 읽고 쓰는 엔드포인트. 저장소 모드(local/cloud)와 상관없이 계정에 저장한다.
 * 진행 중 리밸런싱의 매매 정렬(`rebalancingTaskSort`)과 접어 둔 매매 섹션
 * (`rebalancingCollapsedSections`)을 다룬다. PUT 은 보낸 항목만 바꾼다.
 */

function unauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

export async function GET(request: Request): Promise<Response> {
  const userId = await resolveUserId(request);
  if (!userId) return unauthorized();

  const [rebalancingTaskSort, rebalancingCollapsedSections] = await Promise.all([
    readRebalancingTaskSort(db, userId),
    readRebalancingCollapsedSections(db, userId),
  ]);
  return Response.json({ rebalancingTaskSort, rebalancingCollapsedSections });
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

  const changes = (body ?? {}) as {
    rebalancingTaskSort?: unknown;
    rebalancingCollapsedSections?: unknown;
  };
  const hasSort = changes.rebalancingTaskSort !== undefined;
  const hasSections = changes.rebalancingCollapsedSections !== undefined;
  if (!hasSort && !hasSections) {
    return Response.json({ error: "nothing to update" }, { status: 400 });
  }
  if (hasSort && !isRebalancingTaskSort(changes.rebalancingTaskSort)) {
    return Response.json({ error: "invalid rebalancingTaskSort" }, { status: 400 });
  }
  // 없어진 섹션 이름은 버리고 저장한다 — 목록이 아닐 때만 거절.
  const sections = hasSections
    ? parseCollapsedSections(changes.rebalancingCollapsedSections)
    : null;
  if (hasSections && !sections) {
    return Response.json({ error: "invalid rebalancingCollapsedSections" }, { status: 400 });
  }

  if (hasSort && isRebalancingTaskSort(changes.rebalancingTaskSort)) {
    await writeRebalancingTaskSort(db, userId, changes.rebalancingTaskSort);
  }
  if (sections) await writeRebalancingCollapsedSections(db, userId, sections);
  return Response.json({ ok: true });
}
