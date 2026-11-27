import { describe, expect, it } from "vitest";
import {
  BRAND_BACKGROUND,
  composeSvg,
  encodeIco,
  markInner,
} from "../../../../scripts/brand-icons-lib.mjs";

const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <title>Seedbook</title>
  <!-- 설명 -->
  <circle cx="50" cy="50" r="10" fill="#000"/>
</svg>`;

describe("markInner", () => {
  it("returns the drawing inside the root svg without comments", () => {
    expect(markInner(MARK)).toBe('<circle cx="50" cy="50" r="10" fill="#000"/>');
  });

  it("throws when the source is not a 100×100 viewBox svg", () => {
    expect(() => markInner('<svg viewBox="0 0 24 24"></svg>')).toThrow(/viewBox/);
  });
});

describe("composeSvg", () => {
  it("scales the mark around the center on a full-bleed background", () => {
    const svg = composeSvg(MARK, { scale: 1.2, background: "#E2F4DF" });
    expect(svg).toContain('<rect width="100" height="100" rx="0" fill="#E2F4DF"/>');
    expect(svg).toContain('transform="translate(50 50) scale(1.2) translate(-50 -50)"');
  });

  it("rounds the tile corners when a radius is given", () => {
    expect(composeSvg(MARK, { scale: 1, background: BRAND_BACKGROUND, radius: 22 })).toContain(
      'rx="22"'
    );
  });

  it("leaves the background transparent when none is given", () => {
    expect(composeSvg(MARK, { scale: 1 })).not.toContain("<rect");
  });

  it("can crop the view box for a tight logo", () => {
    expect(composeSvg(MARK, { scale: 1, viewBox: "20 20 60 60" })).toContain(
      'viewBox="20 20 60 60"'
    );
  });
});

describe("encodeIco", () => {
  const png = (size: number) => Buffer.from([0x89, 0x50, 0x4e, 0x47, size]);

  it("writes an ICO header with one directory entry per image", () => {
    const ico = encodeIco([
      { size: 16, png: png(16) },
      { size: 32, png: png(32) },
    ]);
    expect(ico.readUInt16LE(0)).toBe(0); // reserved
    expect(ico.readUInt16LE(2)).toBe(1); // type: icon
    expect(ico.readUInt16LE(4)).toBe(2); // count
  });

  it("points each entry at its embedded PNG", () => {
    const ico = encodeIco([
      { size: 16, png: png(16) },
      { size: 32, png: png(32) },
    ]);
    const entry = (i: number) => 6 + i * 16;
    expect(ico.readUInt8(entry(1))).toBe(32); // width
    expect(ico.readUInt16LE(entry(1) + 6)).toBe(32); // bits per pixel
    const length = ico.readUInt32LE(entry(1) + 8);
    const offset = ico.readUInt32LE(entry(1) + 12);
    expect(ico.subarray(offset, offset + length)).toEqual(png(32));
  });

  it("stores 256px as 0 in the one-byte size fields", () => {
    const ico = encodeIco([{ size: 256, png: png(0) }]);
    expect(ico.readUInt8(6)).toBe(0);
    expect(ico.readUInt8(7)).toBe(0);
  });
});
