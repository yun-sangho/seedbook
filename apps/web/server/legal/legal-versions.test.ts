import type { Database } from "@seedbook/database";
import { LEGAL_DOCUMENT_VERSIONS } from "@seedbook/database/legal";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadLegalVersions } from "./legal-versions";

/** `select().from().where()` 가 영원히 답하지 않는 DB (운영에서 커넥션 풀이 막혔던 상태). */
const hangingDb = {
  select: () => ({ from: () => ({ where: () => new Promise(() => undefined) }) }),
} as unknown as Database;

describe("loadLegalVersions", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  // T34: /terms·/privacy 와 동의 확인이 DB 응답을 영원히 기다렸다.
  it("falls back to the bundled documents when the database never answers", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onTimeout = vi.fn();
    const loading = loadLegalVersions(hangingDb, { timeoutMs: 3000, onTimeout });
    await vi.advanceTimersByTimeAsync(3000);

    await expect(loading).resolves.toEqual({
      versions: LEGAL_DOCUMENT_VERSIONS,
      source: "fallback",
    });
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });
});
