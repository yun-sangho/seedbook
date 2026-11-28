import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { GardenSheet } from "./garden-sheet";

beforeAll(() => {
  // jsdom 에는 포인터 캡처가 없다.
  HTMLElement.prototype.setPointerCapture ??= () => {};
});

function renderSheet() {
  const areaRef = createRef<HTMLElement>();
  render(
    <GardenSheet areaRef={areaRef} header={<p>총 평가금액</p>}>
      <p>본문</p>
    </GardenSheet>
  );
  const button = screen.getByRole("button", { name: /^목록 / });
  const handle = button.querySelector("span")!;
  return { button, handle };
}

describe("GardenSheet", () => {
  it("draws the handle with the SEED bottom sheet handle recipe", () => {
    const { handle } = renderSheet();

    expect(handle).toHaveClass("seed-bottom-sheet-handle__root");
  });

  it("uses the SEED floating layer background like other bottom sheets", () => {
    renderSheet();

    expect(screen.getByRole("region", { name: "정원 목록" })).toHaveClass("bg-bg-layer-floating");
  });

  it("marks the handle active while the header is pressed", () => {
    const { button, handle } = renderSheet();

    fireEvent.pointerDown(button, { pointerId: 1, clientY: 100 });
    expect(handle).toHaveAttribute("data-active");

    fireEvent.pointerUp(button, { pointerId: 1, clientY: 100 });
    expect(handle).not.toHaveAttribute("data-active");
  });
});
