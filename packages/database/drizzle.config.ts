import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit 명령은 보통 호스트에서 실행하므로 .env.local 을 미리 로드한다.
// 컨테이너 부팅 시 마이그레이션은 process env (DATABASE_URL/DIRECT_URL) 을 그대로 쓴다.
loadEnv({ path: ".env.local" });

const url =
  process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "postgresql://localhost:5432/seedbook";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  schemaFilter: ["seedbook"],
  dbCredentials: { url },
  verbose: true,
  strict: true,
});
