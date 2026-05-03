/**
 * Drizzle migration runner. 컨테이너 entrypoint 가 호출.
 *
 * DIRECT_URL 이 설정되어 있으면 그것을, 없으면 DATABASE_URL 을 사용한다.
 * Supabase 풀러는 마이그레이션 시 prepared statement 충돌이 있을 수 있어
 * 가능하면 direct connection 으로 돌리는 게 안전하지만, Drizzle 의 마이그레이션은
 * 단순 SQL apply 라 풀러로도 대부분 동작한다.
 */

import { fileURLToPath } from "node:url";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL or DIRECT_URL must be set");
  }

  // 마이그레이션은 max=1 로 단일 connection 사용. 풀링/prepared statement 이슈 회피.
  const client = postgres(url, { max: 1, prepare: false });
  const db = drizzle(client);

  console.log("Running Drizzle migrations...");
  await migrate(db, { migrationsFolder: path.resolve(__dirname, "../migrations") });
  console.log("Drizzle migrations applied.");

  await client.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
