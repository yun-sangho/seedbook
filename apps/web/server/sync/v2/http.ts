import { createHash } from "node:crypto";
import type { Database } from "@seedbook/database";
import {
  checkSchemaVersion,
  MIN_SCHEMA,
  SCHEMA_VERSION,
  SYNC_HEADERS,
  SYNC_PROTOCOL,
} from "@seedbook/domain";

/**
 * v2 핸들러의 바깥 의존성. 핸들러는 Request → Response 함수라 Next 라우트든 Hono 서버든
 * 이것만 넘기면 그대로 돈다 (설계 §6).
 */
export interface SyncDeps {
  db: Database;
  resolveUserId: (request: Request) => Promise<string | null>;
  /** 구조화 로그 한 줄. 기본은 stdout JSON. */
  log?: (entry: SyncLogEntry) => void;
}

export interface SyncClient {
  schema: number;
  client: string | null;
}

export type SyncLogEntry = Record<string, unknown> & { event: string };

export function writeLog(deps: SyncDeps, entry: SyncLogEntry): void {
  if (deps.log) deps.log(entry);
  else console.info(JSON.stringify(entry));
}

/** 로그에 남기는 사용자 식별값 (원래 id 는 남기지 않는다). */
export function hashUserId(userId: string): string {
  return createHash("sha256").update(userId).digest("hex").slice(0, 12);
}

const jsonError = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status });

/**
 * 프로토콜·데이터 버전 헤더 확인 (설계 §4.1·§7.1). 서버는 버전마다 다르게 동작하지 않는다 —
 * 범위 안이면 같은 코드로 처리하고, 밖이면 막는다.
 * - 데이터 버전이 `MIN_SCHEMA` 미만 → 426 (앱 업데이트 필요)
 * - 서버보다 높음 → 409 `schema_ahead` (앱이 서버 배포보다 먼저 깔림 — 앱은 기다린다)
 */
export function checkSyncHeaders(request: Request): SyncClient | Response {
  if (request.headers.get(SYNC_HEADERS.protocol) !== String(SYNC_PROTOCOL)) {
    return jsonError(400, { code: "protocol", protocol: SYNC_PROTOCOL });
  }
  const rawSchema = request.headers.get(SYNC_HEADERS.schema) ?? "";
  const schema = /^\d+$/.test(rawSchema) ? Number(rawSchema) : Number.NaN;
  if (!Number.isSafeInteger(schema)) return jsonError(400, { code: "schema_header" });

  const gate = checkSchemaVersion(schema);
  if (gate === "too_old") {
    return jsonError(426, { code: "schema_too_old", minSchema: MIN_SCHEMA });
  }
  if (gate === "ahead") return jsonError(409, { code: "schema_ahead", schema: SCHEMA_VERSION });

  const client = request.headers.get(SYNC_HEADERS.client);
  return { schema, client: client ? client.slice(0, 64) : null };
}
