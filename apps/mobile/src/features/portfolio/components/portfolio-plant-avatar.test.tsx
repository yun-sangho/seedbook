import { PlantAvatar } from "@mobile/features/garden/components/plant-avatar";
import { POT_COLORS } from "@mobile/features/garden/plant-3d/plant-options";
import { kindForPortfolio, potForPortfolio } from "@mobile/features/garden/utils/garden-home";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PortfolioPlantAvatar } from "./portfolio-plant-avatar";

describe("PortfolioPlantAvatar", () => {
  it("paints the pot in the same color the garden uses for this portfolio", () => {
    const { container } = render(<PortfolioPlantAvatar portfolioId="p-42" stage={1} size={40} />);
    expect(container.innerHTML).toContain(POT_COLORS[potForPortfolio("p-42")].body);
  });

  it.each(["tree", "fern"] as const)("draws the %s this portfolio grows in the garden", (kind) => {
    const portfolioId =
      Array.from({ length: 100 }, (_, i) => `p-${i}`).find((id) => kindForPortfolio(id) === kind) ??
      "";
    const withoutIds = (html: string) => html.replace(/_r_\w+_/g, "");
    const avatar = render(
      <PortfolioPlantAvatar portfolioId={portfolioId} stage={3} size={40} />
    ).container.querySelector("svg")?.outerHTML;
    const expected = render(
      <PlantAvatar stage="tree" pot={potForPortfolio(portfolioId)} kind={kind} size={40} />
    ).container.innerHTML;
    expect(withoutIds(avatar ?? "")).toBe(withoutIds(expected));
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
    expect(screen.getByRole("img", { name: "이격 초과" })).toBeTruthy();
  });

  it("shows no badge otherwise", () => {
    render(<PortfolioPlantAvatar portfolioId="p1" stage={2} size={40} />);
    expect(screen.queryByRole("img", { name: "이격 초과" })).toBeNull();
  });
});
