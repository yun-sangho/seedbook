import { describe, expect, it } from "vitest";
import { profitToneClass } from "./profit-tone";

describe("profitToneClass", () => {
  it("colors a gain red (국내 관례: 상승 빨강)", () => {
    expect(profitToneClass(1)).toBe("text-fg-critical");
  });

  it("colors a loss blue (국내 관례: 하락 파랑)", () => {
    expect(profitToneClass(-1)).toBe("text-fg-informative");
  });

  it("keeps zero neutral", () => {
    expect(profitToneClass(0)).toBe("text-fg-neutral");
  });
});
