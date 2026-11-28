import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GoalBar, goalBarState } from "./goal-bar";

const calm = { wilt: 0, rain: 0 };

describe("goalBarState", () => {
  it("fills to the goal progress while growing, without a caption", () => {
    expect(goalBarState({ stage: 1, goalState: "set", goalPercent: 42, ...calm })).toEqual({
      percent: 42,
      label: null,
      tone: "brand",
    });
  });

  it("shows only a hint for a seed without a goal", () => {
    expect(
      goalBarState({ stage: 0, goalState: "needs-goal", goalPercent: null, ...calm })
    ).toMatchObject({ percent: null, label: "목표를 더하면 씨앗을 심어요" });
  });

  it("is full with a cheer right after a goal is reached", () => {
    expect(
      goalBarState({ stage: 2, goalState: "needs-goal", goalPercent: null, ...calm })
    ).toMatchObject({ percent: 100, label: "목표 달성!" });
  });

  it("is full and waits for the weights when the goal is reached while drifting", () => {
    expect(
      goalBarState({ stage: 2, goalState: "blocked-by-drift", goalPercent: 100, ...calm })
    ).toMatchObject({ percent: 100, label: "비중을 맞추면 자라요" });
  });

  it("asks for the fruit goal once in flower", () => {
    expect(
      goalBarState({ stage: 4, goalState: "needs-fruit-goal", goalPercent: null, ...calm })
    ).toMatchObject({ percent: 100, label: "꽃이 피었어요" });
  });

  it("is full when the fruit is ripe", () => {
    expect(
      goalBarState({ stage: 4, goalState: "ripe", goalPercent: null, wilt: 1, rain: 0.5 })
    ).toEqual({ percent: 100, label: "열매가 열렸어요", tone: "brand" });
  });

  it("turns to a neutral bar on a market drop, leaving the rain to the plant's condition", () => {
    expect(
      goalBarState({ stage: 1, goalState: "set", goalPercent: 40, wilt: 0, rain: 0.2 })
    ).toEqual({ percent: 40, label: null, tone: "neutral" });
  });

  it("turns to a warning bar while wilting", () => {
    expect(
      goalBarState({ stage: 1, goalState: "set", goalPercent: 40, wilt: 0.35, rain: 0.2 }).tone
    ).toBe("warning");
  });
});

describe("GoalBar", () => {
  it("exposes the progress to assistive tech", () => {
    render(
      <GoalBar
        stage={1}
        goalState="set"
        goalPercent={30}
        wilt={0}
        rain={0}
        ariaLabel="안정형 목표 도달"
      />
    );
    expect(
      screen.getByRole("progressbar", { name: "안정형 목표 도달" }).getAttribute("aria-valuenow")
    ).toBe("30");
  });
});
