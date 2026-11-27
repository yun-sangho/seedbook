import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PLANT_STAGES } from "../plant-3d/plant-options";
import { PlantAvatar } from "./plant-avatar";

describe("PlantAvatar", () => {
  it.each(PLANT_STAGES)("renders the %s stage at the requested size", (stage) => {
    const { container } = render(<PlantAvatar stage={stage} size={32} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("32");
    expect(svg?.getAttribute("height")).toBe("32");
  });

  it("draws more shapes as the plant grows", () => {
    const shapes = (stage: (typeof PLANT_STAGES)[number]) =>
      render(<PlantAvatar stage={stage} size={48} />).container.querySelectorAll(
        "path, circle, ellipse, line"
      ).length;
    expect(shapes("bloom")).toBeGreaterThan(shapes("tree"));
    expect(shapes("tree")).toBeGreaterThan(shapes("seed"));
  });

  it("paints the pot in the portfolio's color", () => {
    const { container } = render(<PlantAvatar stage="seed" pot="sky" size={48} />);
    expect(container.innerHTML).toContain("#86B4E3");
  });
});
