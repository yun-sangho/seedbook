import { randomUUID } from "crypto";
import { schema, type Database } from "@seedbook/database";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { testDatabaseUrl } from "./test-database-url";

/**
 * 테스트 파일마다 하나씩 여는 DB 핸들. 테스트 간 격리는 사용자 단위로 한다 —
 * 테스트마다 `createTestUser` 로 새 사용자를 만들고, 모든 도메인 행은 user 에
 * cascade 로 묶여 있으므로 `close` 때 만든 사용자만 지우면 정리된다.
 */
export function openTestDb() {
  const client = postgres(testDatabaseUrl(), { max: 4, onnotice: () => {} });
  const db = drizzle(client, { schema }) as unknown as Database;
  const createdUserIds: string[] = [];

  async function createTestUser(): Promise<string> {
    const id = `test-${randomUUID()}`;
    const now = new Date();
    await db.insert(schema.user).values({
      id,
      name: id,
      email: `${id}@test.local`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    createdUserIds.push(id);
    return id;
  }

  async function close(): Promise<void> {
    for (const id of createdUserIds) {
      await db.delete(schema.user).where(eq(schema.user.id, id));
    }
    await client.end();
  }

  return { db, createTestUser, close };
}
