import { DB_TIMEOUT_MS } from "@web/server/db-timeout";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { resetDbPool } = vi.hoisted(() => ({ resetDbPool: vi.fn() }));

vi.mock("@seedbook/database", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@seedbook/database")>()),
  resetDbPool,
}));
// 세션 조회도 DB 를 쓴다 — 막힌 커넥션 풀에서는 영원히 답하지 않는다.
vi.mock("@web/lib/auth-server", () => ({
  resolveSessionUserId: () => new Promise(() => undefined),
}));

const { GET } = await import("./route");

describe("GET /api/me/consents", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetDbPool.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  // T34: 앱이 열릴 때마다 부르는 요청이 끝나지 않아 앱이 스피너에 갇혔다.
  it("answers 503 and recycles the connection pool when the database never answers", async () => {
    const response = GET(new Request("http://localhost/api/me/consents"));
    await vi.advanceTimersByTimeAsync(DB_TIMEOUT_MS);

    expect((await response).status).toBe(503);
    expect(resetDbPool).toHaveBeenCalledTimes(1);
  });
});
