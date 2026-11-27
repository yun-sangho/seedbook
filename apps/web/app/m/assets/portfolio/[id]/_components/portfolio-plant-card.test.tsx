import { render, screen } from "@testing-library/react";
import type { PlantStatus } from "@web/features/portfolio/utils/portfolio-plant";
import { describe, expect, it } from "vitest";
import { PortfolioPlantRow } from "./portfolio-plant-card";

function status(partial: Partial<PlantStatus>): PlantStatus {
  return {
    stage: 1,
    drooping: false,
    goalState: "set",
    goalAmount: 10_000_000,
    remainingToNextStage: 2_000_000,
    grew: false,
    ...partial,
  };
}

const noop = () => {};

describe("PortfolioPlantRow", () => {
  it("shows the stage and what is left before the goal amount", () => {
    render(<PortfolioPlantRow status={status({})} onEdit={noop} />);
    expect(screen.getByText("새싹 · 200만원 남음 (목표 1,000만원)")).toBeTruthy();
  });

  it("asks for the next goal after one is reached", () => {
    render(
      <PortfolioPlantRow
        status={status({ goalState: "needs-goal", goalAmount: null, remainingToNextStage: null })}
        onEdit={noop}
      />
    );
    expect(screen.getByText("새싹 · 목표 달성!")).toBeTruthy();
    expect(screen.getByRole("button", { name: "식물 목표 수정" }).textContent).toBe("목표 정하기");
  });

  it("notes a drooping plant", () => {
    render(<PortfolioPlantRow status={status({ drooping: true })} onEdit={noop} />);
    expect(screen.getByText(/시들해요/)).toBeTruthy();
  });

  it("hides the edit button once the plant is fully grown", () => {
    render(
      <PortfolioPlantRow
        status={status({ stage: 4, goalState: "complete", goalAmount: null })}
        onEdit={noop}
      />
    );
    expect(screen.queryByRole("button", { name: "식물 목표 수정" })).toBeNull();
  });
});
