import { db } from "@seedbook/database";
import { parseSnapshotPayloads } from "@seedbook/domain/v1/account-snapshot-record";
import { resolveUserId } from "@web/lib/auth-server";
import {
  listAccountSnapshots,
  MAX_SNAPSHOTS_PER_REQUEST,
  saveAccountSnapshots,
} from "@web/server/account-snapshots/account-snapshot-transfer";

/**
 * 계좌 총액 일별 기록을 저장소 모드 전환 때 옮긴다 (`lib/storage-migration.ts`).
 *
 * - `GET` — `{ snapshots }`: 이 사용자의 서버 기록 전부 (cloud → local 때 기기 기록과 합친다).
 * - `POST { snapshots }` — 기기 기록을 넣는다 (local → cloud). 같은 계좌·날짜는 덮어쓰고, 이
 *   사용자의 계좌가 아닌 기록은 건너뛴다. `{ saved }`.
 */

function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

export async function GET(request: Request): Promise<Response> {
  const userId = await resolveUserId(request);
  if (!userId) return unauthorized();
  return Response.json({ snapshots: await listAccountSnapshots(db, userId) });
}

export async function POST(request: Request): Promise<Response> {
  const userId = await resolveUserId(request);
  if (!userId) return unauthorized();

  let body: { snapshots?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const snapshots = parseSnapshotPayloads(body.snapshots);
  if (snapshots === null || (body.snapshots as unknown[]).length > MAX_SNAPSHOTS_PER_REQUEST) {
    return Response.json({ error: "Invalid snapshots" }, { status: 400 });
  }
  return Response.json({ saved: await saveAccountSnapshots(db, userId, snapshots) });
}
