import { existsSync } from "fs";
import { dirname, resolve } from "path";
import { drizzle } from "drizzle-orm/postgres-js";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";
import * as schema from "./schema";

// 패키지 자체의 .env.local 을 클라이언트 생성 전에 로드한다.
// stock-crawler / Next.js API 라우트 등에서 import 만 하면 DATABASE_URL 이
// 자동 주입되도록 한다. process.env 에 이미 값이 있으면 dotenv 는 덮어쓰지 않아
// 도커/CI/쉘 export 같은 상위 환경 설정을 존중한다.
function findDatabaseEnvFile(): string | null {
  // 1) __dirname 기반 직접 경로 (dist/ 또는 src/ 에서 ../.env.local)
  const direct = resolve(__dirname, "../.env.local");
  if (existsSync(direct)) return direct;

  // 2) cwd 에서 pnpm-workspace.yaml 을 찾아 올라가면서 monorepo 루트 탐색
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
  loadEnv({ path: envFile });
}

// HMR 환경 (Next dev) 에서 connection 폭증 방지를 위해 globalThis 캐시.
const globalForDb = globalThis as unknown as {
  __seedbookSql?: ReturnType<typeof postgres>;
  __seedbookDb?: ReturnType<typeof drizzle<typeof schema>>;
};

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

// `prepare: false` 는 Supabase Transaction pooler (port 6543) 호환성용. Direct
// connection / Session pooler 에서는 prepared statement 가 동작해도 무방하지만,
// 둘 다 호환되도록 일관되게 끈다 — 본 프로젝트 쿼리 부하에서 의미 있는 성능 차이 없음.
const client =
  globalForDb.__seedbookSql ??
  postgres(databaseUrl, {
    prepare: false,
    max: process.env.NODE_ENV === "production" ? 10 : 5,
  });

export const db = globalForDb.__seedbookDb ?? drizzle(client, { schema, logger: false });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__seedbookSql = client;
  globalForDb.__seedbookDb = db;
}

/**
 * 프로세스 종료 시 호출. postgres-js 의 in-flight 쿼리가 정리될 때까지 기다린다.
 * stock-crawler 같은 long-running 프로세스의 graceful shutdown 에서 사용.
 */
export async function closeDb(): Promise<void> {
  await client.end({ timeout: 5 });
}

export type Database = typeof db;
export { schema };
