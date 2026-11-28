import { currentChangeSeq } from "@seedbook/database";
import {
  DEFAULT_PULL_LIMIT,
  MAX_PULL_LIMIT,
  type PullResponse,
  SYNC_PROTOCOL,
} from "@seedbook/domain";
import { checkSyncHeaders, hashUserId, type SyncDeps, writeLog } from "./http";
import { listChanges } from "./record-repo";

/**
 * 커서 안의 값.
 * - `s`: 이 번호까지 받았다.
 * - `t`: 첫 동기화가 여러 페이지에 걸칠 때, 이 번호 이하의 톰스톤은 빼고 준다 (기기가 본 적 없는
 *   삭제). 첫 동기화가 끝나면 빠진다 — 그 뒤 삭제는 번호가 더 커서 모두 나온다.
 */
interface Cursor {
  s: number;
  t?: number;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeCursor(raw: string): Cursor | null {
  try {
    const value = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as unknown;
    if (typeof value !== "object" || value === null) return null;
    const { s, t } = value as { s?: unknown; t?: unknown };
    if (!Number.isSafeInteger(s) || (s as number) < 0) return null;
    if (t !== undefined && (!Number.isSafeInteger(t) || (t as number) < 0)) return null;
    return t === undefined ? { s: s as number } : { s: s as number, t: t as number };
  } catch {
    return null;
  }
}

/**
 * `GET /api/sync/v2/pull?cursor=<불투명>&limit=500` (설계 §4.3). `changeSeq` 오름차순, 레코드 타입이
 * 한 흐름에 섞이고 `fields` 는 언제나 전체다.
 *
 * - 커서가 없으면 첫 동기화 — 살아 있는 레코드만 준다.
 * - 읽기 전에 사용자의 지금 번호 S 를 읽고 S 까지만 준다. push 는 번호를 받고 레코드를 쓰는 것을 한
 *   트랜잭션에서 하므로, 커밋된 S 이하의 레코드는 모두 커밋돼 있다 → 겹침 구간 없이 놓치지 않는다.
 * - 커서가 S 보다 앞서 있으면 서버가 데이터를 다시 만든 것이다 (`reset: true`, 처음부터 다시 준다).
 * - `changeSeq` 0 인 행 (v1 경로가 쓰고 아직 번호를 받지 않은 행) 은 나오지 않는다. v2 로 바꾸기
 *   직전에 `db:backfill:sync-v2` 를 다시 돌려 번호를 매긴다.
 */
export async function handlePull(request: Request, deps: SyncDeps): Promise<Response> {
  const started = Date.now();
  const client = checkSyncHeaders(request);
  if (client instanceof Response) return client;

  const userId = await deps.resolveUserId(request);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const rawCursor = params.get("cursor");
  const cursor = rawCursor ? decodeCursor(rawCursor) : null;
  if (rawCursor && !cursor) {
    return Response.json({ error: "invalid cursor" }, { status: 400 });
  }
  const rawLimit = params.get("limit");
  const limit = rawLimit === null ? DEFAULT_PULL_LIMIT : Number(rawLimit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PULL_LIMIT) {
    return Response.json({ error: `limit must be 1..${MAX_PULL_LIMIT}` }, { status: 400 });
  }

  const upTo = await currentChangeSeq(deps.db, userId);
  const reset = cursor !== null && cursor.s > upTo;
  const start: Cursor = cursor && !reset ? cursor : { s: 0, t: upTo };
  const fetched = await listChanges(deps.db, userId, {
    after: start.s,
    upTo,
    skipTombstonesUpTo: start.t ?? 0,
    limit,
  });
  const hasMore = fetched.length > limit;
  const records = fetched.slice(0, limit);
  const last = records.at(-1);
  const next: Cursor =
    hasMore && last
      ? { s: Number(last.changeSeq), ...(start.t ? { t: start.t } : {}) }
      : { s: upTo };

  writeLog(deps, {
    event: "sync.pull",
    user: hashUserId(userId),
    protocol: SYNC_PROTOCOL,
    schema: client.schema,
    client: client.client,
    initial: cursor === null,
    records: records.length,
    hasMore,
    reset,
    ms: Date.now() - started,
  });
  return Response.json({
    protocol: SYNC_PROTOCOL,
    records,
    cursor: encodeCursor(next),
    hasMore,
    reset,
  } satisfies PullResponse);
}
