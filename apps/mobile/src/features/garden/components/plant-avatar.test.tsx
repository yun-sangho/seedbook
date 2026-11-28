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

  it.each(["tree", "fern"] as const)("bears fruit at flowers only when ripe (%s)", (kind) => {
    const shapes = (ripe: boolean) =>
      render(
        <PlantAvatar stage="bloom" size={48} kind={kind} ripe={ripe} />
      ).container.querySelectorAll("path, circle, ellipse, line").length;
    expect(shapes(true)).toBeGreaterThan(shapes(false));
  });

  it("paints the pot in the portfolio's color", () => {
    const { container } = render(<PlantAvatar stage="seed" pot="sky" size={48} />);
    expect(container.innerHTML).toContain("#86B4E3");
  });
});

describe("PlantAvatar (fern)", () => {
  // clipPath id (useId) 는 렌더마다 달라 지운다.
  const withoutIds = (html: string) => html.replace(/_r_\w+_/g, "");

  it("draws the seed in its own color", () => {
    const tree = withoutIds(render(<PlantAvatar stage="seed" size={48} />).container.innerHTML);
    const fern = withoutIds(
      render(<PlantAvatar stage="seed" size={48} kind="fern" />).container.innerHTML
    );
    expect(fern).not.toBe(tree);
  });

  it("draws more leaflets as the fern grows", () => {
    const shapes = (stage: (typeof PLANT_STAGES)[number]) =>
      render(<PlantAvatar stage={stage} size={48} kind="fern" />).container.querySelectorAll(
        "ellipse"
      ).length;
    expect(shapes("bloom")).toBeGreaterThan(shapes("tree"));
    expect(shapes("tree")).toBeGreaterThan(shapes("sapling"));
  });

  it("looks different from the tree at the same stage", () => {
    const tree = render(<PlantAvatar stage="tree" size={48} />).container.innerHTML;
    const fern = render(<PlantAvatar stage="tree" size={48} kind="fern" />).container.innerHTML;
    expect(fern).not.toBe(tree);
  });
});
