import { describe, expect, it } from "vitest";
import { clampSheetHeight, sheetSnap } from "./sheet-snap";

const SNAPS = [120, 400, 700];

describe("sheetSnap", () => {
  it("settles on the nearest height after a slow drag", () => {
    expect(sheetSnap(380, 0, SNAPS)).toBe(400);
    expect(sheetSnap(200, 0, SNAPS)).toBe(120);
    expect(sheetSnap(600, 0, SNAPS)).toBe(700);
  });

  it("moves to the next height up after a fast upward flick", () => {
    expect(sheetSnap(420, 1, SNAPS)).toBe(700);
  });

  it("moves to the next height down after a fast downward flick", () => {
    expect(sheetSnap(390, -1, SNAPS)).toBe(120);
  });

  it("stays at the ends when flicked past them", () => {
    expect(sheetSnap(700, 1, SNAPS)).toBe(700);
    expect(sheetSnap(120, -1, SNAPS)).toBe(120);
  });
});

describe("clampSheetHeight", () => {
  it("keeps the height between the lowest and highest snap", () => {
    expect(clampSheetHeight(50, SNAPS)).toBe(120);
    expect(clampSheetHeight(900, SNAPS)).toBe(700);
    expect(clampSheetHeight(500, SNAPS)).toBe(500);
  });
});
