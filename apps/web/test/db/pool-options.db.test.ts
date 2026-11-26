import { postgresPoolOptions } from "@seedbook/database";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { testDatabaseUrl } from "./test-database-url";

/** 운영 crawler 와 같은 풀 설정(연결 하나) — 동시 쿼리가 같은 연결에 겹치게 한다. */
const sql = postgres(
  testDatabaseUrl(),
  postgresPoolOptions({ NODE_ENV: "production", DB_POOL_MAX: "1" })
);

afterAll(() => sql.end({ timeout: 1 }));

describe("postgresPoolOptions against a real server", () => {
  it("answers concurrent queries that share one connection", async () => {
    const rows = await Promise.all(Array.from({ length: 8 }, (_, i) => sql`select ${i}::int as i`));
    expect(rows.map(([row]) => row?.i)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  // T35: 답하지 않는 쿼리는 그 쿼리만 포기한다. 풀을 통째로 버려 다른 쿼리까지 끊지 않는다.
  it("gives up on a query that does not finish in time, and the pool keeps answering", async () => {
    const stuck = sql`select pg_sleep(30)`.then(
      () => "finished",
      (error: { code?: string }) => error.code
    );
    expect(await stuck).toBe("QUERY_TIMEOUT");
    expect(await sql`select 1 as one`).toEqual([{ one: 1 }]);
  }, 15_000);
});
