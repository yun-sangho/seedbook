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

/**
 * postgres.js 커넥션 풀 설정.
 *
 * - `prepare: false`: Supabase Transaction pooler (port 6543) 호환용. Direct connection /
 *   Session pooler 에서도 안전하게 동작.
 * - `connect_timeout`: 연결을 열지 못하면 기다리지 않고 실패한다 (초).
 * - `idle_timeout` · `max_lifetime`: 풀러 연결을 오래 붙잡지 않는다. 운영 web 이 시작할 때 연
 *   풀러 연결 10개를 몇 시간 들고 있다가 모두 답이 없어져, DB 를 쓰는 요청이 전부 멈춘 적이 있다
 *   (T34). 쉬는 연결은 닫고, 오래된 연결은 새로 연다 (초).
 */
export function postgresPoolOptions(nodeEnv: string | undefined) {
  return {
    prepare: false,
    max: nodeEnv === "production" ? 10 : 5,
    connect_timeout: 10,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
  };
}

function createClient(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Set it in the environment before running queries.");
  }
  return postgres(url, postgresPoolOptions(process.env.NODE_ENV));
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

/**
 * 지금 풀을 버리고 다음 쿼리부터 새 풀을 쓴다. 쿼리가 답하지 않을 때(막힌 연결) 부른다. 옛 풀에서
 * 진행 중인 쿼리는 잠깐 기다린 뒤 끊는다 — 기다리지 않고 바로 돌아온다.
 */
export function resetDbPool(): void {
  const stale = globalForDb.__seedbookSql;
  globalForDb.__seedbookSql = undefined;
  globalForDb.__seedbookDb = undefined;
  if (stale) void stale.end({ timeout: 5 }).catch(() => undefined);
}

export type { Database };
export { schema };
