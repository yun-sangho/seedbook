import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GoalBar, goalBarState } from "./goal-bar";

describe("goalBarState", () => {
  it("fills to the goal progress while growing, without a caption", () => {
    expect(goalBarState({ stage: 1, goalState: "set", goalPercent: 42 })).toEqual({
      percent: 42,
      label: null,
    });
  });

  it("shows only a hint for a seed without a goal", () => {
    expect(goalBarState({ stage: 0, goalState: "needs-goal", goalPercent: null })).toEqual({
      percent: null,
      label: "목표를 정하면 자라요",
    });
  });

  it("is full with a cheer right after a goal is reached", () => {
    expect(goalBarState({ stage: 2, goalState: "needs-goal", goalPercent: null })).toEqual({
      percent: 100,
      label: "목표 달성!",
    });
  });

  it("is full once fully grown", () => {
    expect(goalBarState({ stage: 4, goalState: "complete", goalPercent: null })).toEqual({
      percent: 100,
      label: "다 자랐어요",
    });
  });
});

describe("GoalBar", () => {
  it("exposes the progress to assistive tech", () => {
    render(
      <GoalBar
        stage={1}
        goalState="set"
        goalPercent={30}
        drooping={false}
        ariaLabel="안정형 목표 도달"
      />
    );
    expect(
      screen.getByRole("progressbar", { name: "안정형 목표 도달" }).getAttribute("aria-valuenow")
    ).toBe("30");
  });
});
