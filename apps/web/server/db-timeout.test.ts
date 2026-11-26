import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DbTimeoutError, withDbTimeout } from "./db-timeout";

const never = <T>() => new Promise<T>(() => undefined);

describe("withDbTimeout", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns the result of work that answers in time", async () => {
    await expect(withDbTimeout(async () => 42, { ms: 1000 })).resolves.toBe(42);
  });

  it("passes through the error of work that fails in time", async () => {
    const failing = withDbTimeout(
      async () => {
        throw new Error("boom");
      },
      { ms: 1000 }
    );
    await expect(failing).rejects.toThrow("boom");
  });

  // T34: 막힌 커넥션 풀에서 쿼리가 영원히 답하지 않아 요청도 영원히 멈췄다.
  it("gives up on work that never answers, instead of waiting forever", async () => {
    const result = withDbTimeout(never, { ms: 1000 });
    const assertion = expect(result).rejects.toBeInstanceOf(DbTimeoutError);
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });
});
