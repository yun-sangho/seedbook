import { lockChangeSeqs } from "@seedbook/database";
import {
  MAX_PUSH_BYTES,
  MAX_PUSH_OPS,
  type PushResponse,
  SYNC_PROTOCOL,
  type SyncOpResult,
} from "@seedbook/domain";
import { checkSyncHeaders, hashUserId, type SyncDeps, writeLog } from "./http";
import { type AppliedOp, applyOp } from "./record-repo";

/**
 * `POST /api/sync/v2/push` (설계 §4.2). body `{ ops: SyncOp[] }` 를 한 트랜잭션에서 순서대로
 * 적용하고, op 마다 결과를 같은 순서로 돌려준다. 맨 앞에서 사용자의 `user_sync_state` 행을 잠가
 * 한 사용자의 push 는 하나씩만 커밋된다 → `changeSeq` 순서 = 커밋 순서.
 */
export async function handlePush(request: Request, deps: SyncDeps): Promise<Response> {
  const started = Date.now();
  const client = checkSyncHeaders(request);
  if (client instanceof Response) return client;

  const userId = await deps.resolveUserId(request);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_PUSH_BYTES) {
    return Response.json({ error: `body over ${MAX_PUSH_BYTES} bytes` }, { status: 413 });
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const ops = (body as { ops?: unknown } | null)?.ops;
  if (!Array.isArray(ops)) {
    return Response.json({ error: "body must be { ops: [...] }" }, { status: 400 });
  }
  if (ops.length > MAX_PUSH_OPS) {
    return Response.json({ error: `at most ${MAX_PUSH_OPS} ops` }, { status: 413 });
  }

  const applied: AppliedOp[] = [];
  if (ops.length > 0) {
    await deps.db.transaction(async (tx) => {
      await lockChangeSeqs(tx, userId);
      for (const op of ops) applied.push(await applyOp(tx, userId, op));
    });
  }

  const results = applied.map((a) => a.result);
  writeLog(deps, {
    event: "sync.push",
    user: hashUserId(userId),
    protocol: SYNC_PROTOCOL,
    schema: client.schema,
    client: client.client,
    ...summarize(applied),
    ms: Date.now() - started,
  });
  return Response.json({ results } satisfies PushResponse);
}

/** 로그용 요약 — 건수와 거부 코드만, 값은 담지 않는다 (개인정보). */
function summarize(applied: AppliedOp[]) {
  const counts: Record<SyncOpResult["status"], number> = { ok: 0, partial: 0, rejected: 0 };
  const codes: Record<string, number> = {};
  const fieldRejections = new Map<string, { type: string; field: string; code: string }>();
  for (const { type, result } of applied) {
    counts[result.status] += 1;
    if (result.status === "rejected") codes[result.code] = (codes[result.code] ?? 0) + 1;
    const rejected = result.status === "ok" ? [] : (result.rejected ?? []);
    for (const { field, code } of rejected) {
      const entry = { type: type ?? "?", field, code };
      fieldRejections.set(`${entry.type}.${field}.${code}`, entry);
    }
  }
  return { ops: applied.length, ...counts, codes, fieldRejections: [...fieldRejections.values()] };
}
