import type { PlantStatus } from "@mobile/features/portfolio/utils/portfolio-plant";
import { render, screen } from "@testing-library/react";
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
  it("shows the stage name and fills the bar toward the goal", () => {
    render(<PortfolioPlantRow status={status({})} value={8_000_000} onEdit={noop} />);
    expect(screen.getByText("새싹")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("80");
  });

  it("offers to set the next goal after one is reached", () => {
    render(
      <PortfolioPlantRow
        status={status({ goalState: "needs-goal", goalAmount: null, remainingToNextStage: null })}
        value={12_000_000}
        onEdit={noop}
      />
    );
    expect(screen.getByText("목표 달성!")).toBeTruthy();
    expect(screen.getByRole("button", { name: "식물 목표 수정" }).textContent).toBe("목표 정하기");
  });

  it("notes a drooping plant", () => {
    render(
      <PortfolioPlantRow status={status({ drooping: true })} value={5_000_000} onEdit={noop} />
    );
    expect(screen.getByText(/시들해요/)).toBeTruthy();
  });

  it("hides the edit button once the plant is fully grown", () => {
    render(
      <PortfolioPlantRow
        status={status({ stage: 4, goalState: "complete", goalAmount: null })}
        value={0}
        onEdit={noop}
      />
    );
    expect(screen.queryByRole("button", { name: "식물 목표 수정" })).toBeNull();
  });
});
