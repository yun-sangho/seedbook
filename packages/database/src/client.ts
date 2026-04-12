import { existsSync } from "fs";
import { dirname, resolve } from "path";
import { PrismaClient } from "@prisma/client";
import { config as loadEnv } from "dotenv";

// 패키지 자체의 .env.local 을 PrismaClient 생성 전에 로드한다.
// 이렇게 하면 이 패키지를 import 하는 모든 소비자(stock-crawler, Next.js API
// 라우트 등) 가 DATABASE_URL 을 따로 설정하지 않아도 바로 동작한다.
// 이미 process.env 에 DATABASE_URL 이 있으면 dotenv 는 기본적으로 덮어쓰지 않아
// 도커/CI/쉘 export 같은 상위 환경 설정을 존중한다.
//
// 다양한 실행 컨텍스트(tsx, 컴파일된 dist, Turbopack bundle, Next.js dev)에서
// `__dirname` 이 가리키는 경로가 제각각이므로, 여러 후보를 순회하며
// pnpm-workspace.yaml 기반으로 monorepo 루트를 찾아 .env.local 을 찾는다.
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

// Avoid creating multiple instances in dev (hot reload)
const globalForPrisma = global as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV === "development") {
  globalForPrisma.prisma = prisma;
}
