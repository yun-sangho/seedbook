import { postgresPoolOptions } from "@seedbook/database";
import { describe, expect, it } from "vitest";

describe("postgresPoolOptions", () => {
  it("keeps prepared statements off for the Supabase transaction pooler", () => {
    expect(postgresPoolOptions("production").prepare).toBe(false);
  });

  it("gives up on a connection that cannot be opened instead of waiting", () => {
    expect(postgresPoolOptions("production").connect_timeout).toBeGreaterThan(0);
  });

  it("replaces long-lived connections", () => {
    expect(postgresPoolOptions("production").max_lifetime).toBeGreaterThan(0);
  });

  // T35: 쉬는 연결을 닫으면 다음 요청마다 새 연결을 연다. 멈춤의 원인은 파이프라인이었지 쉰 연결이 아니었다.
  it("keeps idle connections open", () => {
    expect(postgresPoolOptions("production")).not.toHaveProperty("idle_timeout");
  });

  // T35: Supabase 풀러(Supavisor, 6543 transaction mode)는 한 연결에 파이프라인으로 보낸 쿼리에
  // 답하지 않는다. 운영에서 동시에 보낸 8개 중 7개가 매번 멈췄고, max_pipeline 1 이면 모두 답했다.
  it("sends one query at a time on each connection, since the pooler hangs on pipelined queries", () => {
    expect(postgresPoolOptions("production").max_pipeline).toBe(1);
  });

  // T35: 풀러가 답하지 않는 쿼리는 그 쿼리만 포기하고 그 연결만 다시 연다 — 다른 요청의 쿼리는 건드리지 않는다.
  it("gives up on a query the pooler stops answering, within the web request deadline", () => {
    const options = postgresPoolOptions("production");
    expect(options.query_timeout).toBeGreaterThan(0);
    expect(options.cancel_timeout).toBeGreaterThan(0);
  });

  it("uses a smaller pool outside production", () => {
    expect(postgresPoolOptions("development").max).toBeLessThan(
      postgresPoolOptions("production").max
    );
  });
});
