import { render, screen } from "@testing-library/react";
import { POT_COLORS } from "@web/features/garden/plant-3d/plant-options";
import { potForPortfolio } from "@web/features/garden/utils/garden-home";
import { describe, expect, it } from "vitest";
import { PortfolioPlantAvatar } from "./portfolio-plant-avatar";

describe("PortfolioPlantAvatar", () => {
  it("paints the pot in the same color the garden uses for this portfolio", () => {
    const { container } = render(<PortfolioPlantAvatar portfolioId="p-42" stage={1} size={40} />);
    expect(container.innerHTML).toContain(POT_COLORS[potForPortfolio("p-42")].body);
  });

  it("draws the plant at its growth stage", () => {
    const shapes = (stage: 0 | 4) =>
      render(
        <PortfolioPlantAvatar portfolioId="p1" stage={stage} size={40} />
      ).container.querySelectorAll("path, circle, ellipse, line").length;
    expect(shapes(4)).toBeGreaterThan(shapes(0));
  });

  it("marks a portfolio that needs rebalancing with the garden's ! badge", () => {
    render(<PortfolioPlantAvatar portfolioId="p1" stage={2} size={40} needsRebalance />);
    expect(screen.getByRole("img", { name: "리밸런싱 필요" })).toBeTruthy();
  });

  it("shows no badge otherwise", () => {
    render(<PortfolioPlantAvatar portfolioId="p1" stage={2} size={40} />);
    expect(screen.queryByRole("img", { name: "리밸런싱 필요" })).toBeNull();
  });
});
