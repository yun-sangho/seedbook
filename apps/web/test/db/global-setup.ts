import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { testDatabaseUrl } from "./test-database-url";

const MIGRATIONS_FOLDER = resolve(__dirname, "../../../../packages/database/migrations");

/**
 * DB 통합 테스트 1 회 준비: 테스트 DB 가 없으면 만들고, 운영과 같은 drizzle 마이그레이션을
 * 적용한다 (이미 적용된 것은 건너뜀). 데이터는 각 테스트가 사용자 단위로 만들고 지운다.
 *
 * 아직 배포 전인 마이그레이션을 다시 생성했다면 테스트 DB 의 이력과 어긋날 수 있다 —
 * 그때는 `seedbook_test` DB 를 직접 지우고 다시 돌린다.
 */
export default async function setup(): Promise<void> {
  const url = testDatabaseUrl();
  const dbName = new URL(url).pathname.replace(/^\//, "");

  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
  try {
    const existing = await admin`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
    if (existing.length === 0) {
      await admin.unsafe(`CREATE DATABASE "${dbName}"`);
    }
  } finally {
    await admin.end();
  }

  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await client.end();
  }
}
