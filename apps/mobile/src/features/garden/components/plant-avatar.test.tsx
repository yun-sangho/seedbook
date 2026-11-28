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

  it.each(["tree", "fern"] as const)("draws an empty pot without the seed (%s)", (kind) => {
    const shapes = (empty: boolean) =>
      render(
        <PlantAvatar stage="seed" kind={kind} empty={empty} size={48} />
      ).container.querySelectorAll("path, circle, ellipse, line").length;
    expect(shapes(true)).toBeLessThan(shapes(false));
  });

  it("rains behind the plant only after a market drop, heavier with a deeper drop", () => {
    const drops = (rain?: number) =>
      render(<PlantAvatar stage="tree" size={48} rain={rain} />).container.querySelectorAll(
        "[data-rain] line"
      );
    expect(drops()).toHaveLength(0);
    expect(drops(0).length).toBe(0);
    const light = drops(0.2);
    const heavy = drops(1);
    expect(light.length).toBeGreaterThan(0);
    expect(heavy.length).toBeGreaterThan(light.length);
    const width = (line: Element | undefined) =>
      Number(line?.closest("[data-rain]")?.getAttribute("stroke-width"));
    expect(width(heavy[0])).toBeGreaterThan(width(light[0]));
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
