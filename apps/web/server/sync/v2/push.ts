import { lockChangeSeqs } from "@seedbook/database";
import {
  MAX_PUSH_BYTES,
  MAX_PUSH_OPS,
  type PushResponse,
  SYNC_PROTOCOL,
  type SyncOpResult,
} from "@seedbook/domain";
import { checkSyncHeaders, hashUserId, type SyncDeps, writeLog } from "./http";
import { type AppliedOp, applyOp, type Tx } from "./record-repo";

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
      for (const op of ops) applied.push(await applyOpInSavepoint(tx, userId, op));
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

/** PostgreSQL 오류 코드 (drizzle 이 감싼 경우 `cause` 에 있다). */
function pgErrorCode(error: unknown): string | null {
  const direct = (error as { code?: unknown } | null)?.code;
  if (typeof direct === "string") return direct;
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause?.code;
  return typeof cause === "string" ? cause : null;
}

/**
 * DB 가 이 op 의 값 때문에 거절했는지 — 다시 보내도 같은 결과라 `invalid` 로 답할 오류다.
 * - 22xxx (값 오류: 범위 밖 숫자 등), 23503 (외래 키 위반: 없는 포트폴리오를 가리키는 연결),
 *   23505 (고유 제약), 23514 (CHECK).
 *
 * 그 밖(없는 컬럼 42703, NOT NULL 23502, 연결·직렬화 오류 …)은 서버 쪽 문제다 — 배포 중 스키마와
 * 코드가 잠깐 어긋난 경우 등. `invalid` 로 답하면 기기가 그 편집을 격리하고 서버 값으로 되돌리므로,
 * 요청 전체를 실패(500)시켜 기기가 나중에 다시 보내게 한다.
 */
export function isOpRefusedByDatabase(error: unknown): boolean {
  const code = pgErrorCode(error);
  if (code === null) return false;
  return code.startsWith("22") || code === "23503" || code === "23505" || code === "23514";
}

/**
 * op 하나를 savepoint 안에서 적용한다. DB 가 op 의 값 때문에 거절한 op 는 그 op 만 되돌리고
 * `invalid` 로 답한다 — 한 op 때문에 요청 전체가 실패하면 기기의 outbox 가 같은 묶음을 끝없이 다시
 * 보낸다. 서버 쪽 오류는 다시 던져 요청 전체를 실패시킨다 (`isOpRefusedByDatabase`).
 */
async function applyOpInSavepoint(tx: Tx, userId: string, op: unknown): Promise<AppliedOp> {
  try {
    return await tx.transaction((savepoint) => applyOp(savepoint as Tx, userId, op));
  } catch (error) {
    const code = pgErrorCode(error);
    if (!isOpRefusedByDatabase(error)) {
      console.error("[sync] push failed on a server error", code);
      throw error;
    }
    const type = (op as { type?: unknown } | null)?.type;
    console.warn("[sync] push op refused by the database", code);
    return {
      type: typeof type === "string" ? type : null,
      result: { status: "rejected", code: "invalid" },
    };
  }
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
