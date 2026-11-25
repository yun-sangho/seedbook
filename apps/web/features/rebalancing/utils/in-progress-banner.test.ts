import { describe, expect, it } from "vitest";
import type { RebalancingSession, RebalancingTask } from "../types/types";
import { inProgressBanner } from "./in-progress-banner";

function task(id: string, done: boolean, ordered = false): RebalancingTask {
  return {
    id,
    market: "KOSPI",
    ticker: id,
    name: id,
    action: "매수",
    amount: 1000,
    price: 100,
    quantity: 10,
    priceAsOf: null,
    priceKind: null,
    done,
    ...(ordered ? { orderedQuantity: 10, orderedPrice: 100 } : {}),
  };
}

function session(id: string, tasks: RebalancingTask[], completedAt: string | null = null) {
  return {
    id,
    accountId: `acc-${id}`,
    accountName: `${id} 계좌`,
    portfolioId: "p",
    portfolioName: "P",
    cashDelta: 0,
    tasks,
    startedAt: "2026-11-25T00:00:00.000Z",
    completedAt,
  } satisfies RebalancingSession;
}

const NO_NAMES = new Map<string, string>();
const half = [task("a", true), task("b", false)];
const full = [task("a", true), task("b", true)];

describe("inProgressBanner", () => {
  it("진행 중인 리밸런싱이 없으면 null", () => {
    expect(inProgressBanner([], NO_NAMES)).toBeNull();
    expect(inProgressBanner([session("X", full, "2026-11-25T01:00:00.000Z")], NO_NAMES)).toBeNull();
  });

  it("한 건이면 진행 상황과 함께 그 리밸런싱으로 보낸다", () => {
    expect(inProgressBanner([session("X", half)], NO_NAMES)).toEqual({
      sessionId: "X",
      readyToComplete: false,
      title: "진행 중인 리밸런싱 이어가기",
      description: "X 계좌 · 매매 2건 중 1건 체결",
    });
  });

  it("주문 중인 매매가 있으면 함께 알린다", () => {
    const tasks = [task("a", true), task("b", false, true), task("c", false)];
    expect(inProgressBanner([session("X", tasks)], NO_NAMES)?.description).toBe(
      "X 계좌 · 매매 3건 중 1건 체결, 1건 주문 중"
    );
  });

  it("한 건을 모두 체결했으면 완료만 남았다고 알린다", () => {
    expect(inProgressBanner([session("X", full)], NO_NAMES)).toEqual({
      sessionId: "X",
      readyToComplete: true,
      title: "리밸런싱 완료만 남았어요",
      description: "X 계좌 · 매매 2건을 모두 체결했어요",
    });
  });

  it("매매가 하나도 없는 리밸런싱은 다 체결한 것으로 보지 않는다", () => {
    expect(inProgressBanner([session("X", [])], NO_NAMES)?.readyToComplete).toBe(false);
  });

  it("여러 건이면 목록으로 보내고 계좌를 나열한다", () => {
    expect(inProgressBanner([session("X", half), session("Y", half)], NO_NAMES)).toEqual({
      sessionId: null,
      readyToComplete: false,
      title: "진행 중인 리밸런싱 2건 이어가기",
      description: "X 계좌, Y 계좌",
    });
  });

  it("여러 건 중 일부만 다 체결했으면 몇 건이 완료만 남았는지 알린다", () => {
    expect(inProgressBanner([session("X", half), session("Y", full)], NO_NAMES)).toEqual({
      sessionId: null,
      readyToComplete: false,
      title: "진행 중인 리밸런싱 2건 이어가기",
      description: "X 계좌, Y 계좌 · 1건은 완료만 남았어요",
    });
  });

  it("여러 건을 모두 체결했으면 완료만 남았다고 알린다", () => {
    expect(inProgressBanner([session("X", full), session("Y", full)], NO_NAMES)).toEqual({
      sessionId: null,
      readyToComplete: true,
      title: "리밸런싱 2건, 완료만 남았어요",
      description: "X 계좌, Y 계좌",
    });
  });

  it("끝난 기록은 세지 않는다", () => {
    const done = session("Z", full, "2026-11-25T01:00:00.000Z");
    expect(inProgressBanner([done, session("X", half)], NO_NAMES)?.sessionId).toBe("X");
  });

  it("계좌가 남아 있으면 지금 이름을, 이름이 없으면 대체 이름을 쓴다", () => {
    const names = new Map([["acc-X", "새 이름"]]);
    expect(inProgressBanner([session("X", full)], names)?.description).toContain("새 이름 ·");
    const unnamed = { ...session("Y", full), accountName: "" };
    expect(inProgressBanner([unnamed], NO_NAMES)?.description).toContain("이름 없는 계좌 ·");
  });
});
