import { postgresPoolOptions } from "@seedbook/database";
import { describe, expect, it } from "vitest";

describe("postgresPoolOptions", () => {
  it("keeps prepared statements off for the Supabase transaction pooler", () => {
    expect(postgresPoolOptions("production").prepare).toBe(false);
  });

  it("gives up on a connection that cannot be opened instead of waiting", () => {
    expect(postgresPoolOptions("production").connect_timeout).toBeGreaterThan(0);
  });

  // T34: 운영 web 이 3시간 전에 연 풀러 연결 10개를 계속 붙잡고 있다가 모두 막혔다.
  it("closes idle connections and replaces long-lived ones", () => {
    const options = postgresPoolOptions("production");
    expect(options.idle_timeout).toBeGreaterThan(0);
    expect(options.max_lifetime).toBeGreaterThan(0);
  });

  it("uses a smaller pool outside production", () => {
    expect(postgresPoolOptions("development").max).toBeLessThan(
      postgresPoolOptions("production").max
    );
  });
});
