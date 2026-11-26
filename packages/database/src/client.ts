import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema";

// 패키지 자체의 .env.local 을 import 시점에 로드한다.
// stock-crawler / Next.js API 라우트 등에서 import 만 하면 DATABASE_URL 이
// 자동 주입되도록 한다. process.env 에 이미 값이 있으면 dotenv 는 덮어쓰지 않아
// 도커/CI/쉘 export 같은 상위 환경 설정을 존중한다.
function findDatabaseEnvFile(): string | null {
  const direct = resolve(__dirname, "../.env.local");
  if (existsSync(direct)) return direct;

  let dir = process.cwd();
  for (let depth = 0; depth < 6; depth += 1) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) {
      const candidate = resolve(dir, "packages/database/.env.local");
      if (existsSync(candidate)) return candidate;
      return null;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const envFile = findDatabaseEnvFile();
if (envFile) {
  loadEnv({ path: envFile, quiet: true });
}

// 실제 DB 연결은 첫 사용 시점에 만든다 (lazy). Next.js 빌드 (정적 페이지 분석)
// 에서는 DATABASE_URL 이 없을 수 있어, 모듈 로드 시점에 throw 하면 빌드가 깨진다.
// 컨테이너 부팅 후 첫 쿼리 시점에 검증하도록 미룬다.
type Database = PostgresJsDatabase<typeof schema>;

// HMR 환경 (Next dev) 에서 connection 폭증 방지를 위해 globalThis 캐시.
const globalForDb = globalThis as unknown as {
  __seedbookSql?: Sql;
  __seedbookDb?: Database;
};

/** 운영 web 의 기본 풀 크기. crawler 는 `DB_POOL_MAX=1` 로 줄인다 (`docker-compose.yml`). */
const PRODUCTION_POOL_MAX = 8;
const DEVELOPMENT_POOL_MAX = 5;

type PoolEnv = { NODE_ENV?: string; DB_POOL_MAX?: string };

function poolMax({ NODE_ENV, DB_POOL_MAX }: PoolEnv): number {
  if (DB_POOL_MAX === undefined) {
    return NODE_ENV === "production" ? PRODUCTION_POOL_MAX : DEVELOPMENT_POOL_MAX;
  }
  const max = Number(DB_POOL_MAX);
  if (DB_POOL_MAX.trim() === "" || !Number.isInteger(max) || max < 1) {
    throw new Error(`DB_POOL_MAX must be a positive integer, got ${JSON.stringify(DB_POOL_MAX)}`);
  }
  return max;
}

/**
 * postgres.js 커넥션 풀 설정.
 *
 * - `max`: 앱별 풀 크기. 운영 DB 는 Supabase session pooler (`*.pooler.supabase.com:5432`) 로
 *   붙는데, session mode 는 클라이언트 연결 하나가 서버 연결 하나를 쥐고 있고 서버 연결은 15개까지다.
 *   web 8 + stock-crawler 1 = 9 로 두고, 나머지는 배포 때 컨테이너가 겹치거나 마이그레이션
 *   (`scripts/migrate.ts`, 자체 연결 1개)·`docker compose exec stock-crawler` 로 돌리는 스크립트
 *   (crawler 의 `DB_POOL_MAX=1` 을 물려받는다) 가 쓰는 여유다. `DB_POOL_MAX` 가 없으면 운영 8
 *   (web), 그 밖은 5. crawler 는 쿼리를 하나씩 기다려 보내므로 1 개로 충분하고, 동시에 보내도
 *   연결이 빌 때까지 차례를 기다린다 (그 대기도 `query_timeout` 에 들어간다).
 * - `prepare: false`: 풀러(transaction mode)와 호환되게 prepared statement 를 쓰지 않는다.
 *   Direct connection / session pooler 에서도 안전하게 동작.
 * - `connect_timeout`: 연결을 열지 못하면 기다리지 않고 실패한다 (초).
 * - `max_pipeline: 1`: 한 연결에 쿼리를 하나씩만 보낸다. postgres.js 4 는 기본으로 한 연결에 쿼리를
 *   100개까지 파이프라인으로 보내는데, Supabase 풀러(Supavisor, 6543 transaction mode)는 파이프라인
 *   쿼리에 답하지 않는다. 운영에서 한 연결에 동시에 보낸 8개 중 7개가 매번 답이 없었고(취소 요청도),
 *   1 이면 모두 답했다. 동시 요청이 한 연결에 겹칠 때마다 쿼리가 멈췄다 (T34·T35).
 * - `query_timeout` · `cancel_timeout`: 그래도 답하지 않는 쿼리는 `query_timeout` 뒤 취소하고, 취소에도
 *   `cancel_timeout` 안에 답이 없으면 그 연결만 닫고 다시 연다. 다른 연결의 쿼리는 건드리지 않는다.
 *   둘을 더한 값이 web 요청의 DB 제한(`DB_TIMEOUT_MS` 8초) 안에 들어온다 (초).
 * - `max_lifetime`: 오래된 연결은 새로 연다 (초). 쉬는 연결은 닫지 않고 둔다 — 새 연결을 여는 비용을
 *   매번 치르지 않게. 쉰 연결도 운영 측정에서 바로 답했다.
 */
export function postgresPoolOptions(env: PoolEnv) {
  return {
    prepare: false,
    max: poolMax(env),
    connect_timeout: 10,
    max_lifetime: 60 * 30,
    max_pipeline: 1,
    query_timeout: 6,
    cancel_timeout: 2,
  };
}

function createClient(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Set it in the environment before running queries.");
  }
  return postgres(url, postgresPoolOptions(process.env));
}

function ensureClient(): Sql {
  if (globalForDb.__seedbookSql) return globalForDb.__seedbookSql;
  const client = createClient();
  globalForDb.__seedbookSql = client;
  return client;
}

function ensureDb(): Database {
  if (globalForDb.__seedbookDb) return globalForDb.__seedbookDb;
  const instance = drizzle(ensureClient(), { schema, logger: false });
  globalForDb.__seedbookDb = instance;
  return instance;
}

/**
 * Drizzle DB 핸들. Proxy 라 import 시점엔 connection 을 만들지 않고, 처음 사용
 * (db.select / db.insert / db.query.x ...) 할 때 connection 을 lazy 생성한다.
 * Next.js build-time static analysis 가 DATABASE_URL 없이 모듈을 로드해도
 * 안전하다.
 */
export const db = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    const real = ensureDb() as unknown as Record<string | symbol, unknown>;
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
}) as Database;

/**
 * 프로세스 종료 시 호출. stock-crawler 등 long-running 프로세스 graceful shutdown.
 */
export async function closeDb(): Promise<void> {
  if (globalForDb.__seedbookSql) {
    await globalForDb.__seedbookSql.end({ timeout: 5 });
    globalForDb.__seedbookSql = undefined;
    globalForDb.__seedbookDb = undefined;
  }
}

export type { Database };
export { schema };
