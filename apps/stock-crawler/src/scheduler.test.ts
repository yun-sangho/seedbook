import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * scheduler.ts 는 node-cron + sync-stock-list/prices 에 의존한다.
 * - node-cron 을 mock 하여 `cron.schedule(expr, handler)` 로 넘어온 handler 를
 *   수동으로 호출함으로써 runJob 의 동시 실행 방지 락 (`isRunning`) 을 검증한다.
 * - 의존 job 들은 각자 resolvable promise 로 대체해서 실행 중 상태를 관찰할 수
 *   있게 한다.
 */

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
};

function defer<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const mocks = vi.hoisted(() => {
  return {
    cronSchedule: vi.fn(),
    syncStockList: vi.fn(),
    syncStockPrices: vi.fn(),
  };
});

vi.mock("node-cron", () => ({
  schedule: mocks.cronSchedule,
  default: { schedule: mocks.cronSchedule },
}));

vi.mock("./jobs/sync-stock-list.js", () => ({
  syncStockList: mocks.syncStockList,
}));

vi.mock("./jobs/sync-stock-prices.js", () => ({
  syncStockPrices: mocks.syncStockPrices,
}));

const { isJobRunning, startScheduler } = await import("./scheduler.js");

describe("scheduler", () => {
  beforeEach(() => {
    mocks.cronSchedule.mockReset();
    mocks.syncStockList.mockReset();
    mocks.syncStockPrices.mockReset();
  });

  it("isJobRunning(): 실행 전 false → 실행 중 true → 완료 후 false", async () => {
    const deferred = defer<void>();
    mocks.syncStockList.mockImplementation(() => deferred.promise);

    startScheduler();
    // cron.schedule 은 최소 2회 등록됨 (오전/오후)
    expect(mocks.cronSchedule).toHaveBeenCalledTimes(2);

    // 오전 handler = 첫 번째 호출의 두 번째 인자
    const morningHandler = mocks.cronSchedule.mock.calls[0]![1] as () => void;

    expect(isJobRunning()).toBe(false);

    // handler 호출 시 runJob 내부에서 await 하기 전에 isRunning=true 로 세팅
    morningHandler();
    // 마이크로태스크 진행: runJob 내부가 await fn() 까지 도달
    await Promise.resolve();

    expect(isJobRunning()).toBe(true);

    deferred.resolve();
    // runJob 의 finally 블록이 돌아가도록 기다림
    await Promise.resolve();
    await Promise.resolve();

    expect(isJobRunning()).toBe(false);
  });

  it("이전 작업 실행 중이면 두 번째 handler 호출은 건너뜀", async () => {
    const deferred = defer<void>();
    mocks.syncStockList.mockImplementation(() => deferred.promise);

    startScheduler();

    const morningHandler = mocks.cronSchedule.mock.calls[0]![1] as () => void;

    // 첫 번째 호출 → 실행 시작
    morningHandler();
    await Promise.resolve();
    expect(isJobRunning()).toBe(true);
    expect(mocks.syncStockList).toHaveBeenCalledTimes(1);

    // 두 번째 호출 → 락에 막혀 즉시 반환, syncStockList 호출 수 변화 없음
    morningHandler();
    await Promise.resolve();
    expect(mocks.syncStockList).toHaveBeenCalledTimes(1);

    // 첫 작업 완료 후 다시 실행하면 정상 동작
    deferred.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(isJobRunning()).toBe(false);

    const deferred2 = defer<void>();
    mocks.syncStockList.mockImplementation(() => deferred2.promise);
    morningHandler();
    await Promise.resolve();
    expect(mocks.syncStockList).toHaveBeenCalledTimes(2);

    deferred2.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
});
