import { describe, expect, it } from "vitest";
import { createSourceBackoff } from "./source-backoff";

const MINUTE = 60 * 1000;
const T0 = new Date("2026-11-09T01:00:00Z").getTime();

function backoff() {
  return createSourceBackoff({ baseMs: 2 * MINUTE, maxMs: 30 * MINUTE });
}

describe("createSourceBackoff", () => {
  it("allows calls before any failure", () => {
    expect(backoff().canCall(T0)).toBe(true);
  });

  it("pauses calls for the base duration after the first failure", () => {
    const b = backoff();
    b.recordFailure(T0);

    expect(b.canCall(T0 + 2 * MINUTE - 1)).toBe(false);
  });

  it("allows calls again once the pause is over", () => {
    const b = backoff();
    b.recordFailure(T0);

    expect(b.canCall(T0 + 2 * MINUTE)).toBe(true);
  });

  it("doubles the pause on each consecutive failure", () => {
    const b = backoff();
    b.recordFailure(T0);
    b.recordFailure(T0 + 2 * MINUTE);

    expect(b.canCall(T0 + 2 * MINUTE + 4 * MINUTE - 1)).toBe(false);
    expect(b.canCall(T0 + 2 * MINUTE + 4 * MINUTE)).toBe(true);
  });

  it("never pauses longer than the max duration", () => {
    const b = backoff();
    for (let i = 0; i < 10; i++) b.recordFailure(T0);

    expect(b.canCall(T0 + 30 * MINUTE)).toBe(true);
  });

  it("resets the pause length after a success", () => {
    const b = backoff();
    b.recordFailure(T0);
    b.recordFailure(T0);
    b.recordSuccess();
    b.recordFailure(T0);

    expect(b.canCall(T0 + 2 * MINUTE)).toBe(true);
  });
});
