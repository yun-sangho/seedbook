import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { iosStartupImages } from "./ios-splash";

const publicDir = resolve(__dirname, "../public");

describe("iosStartupImages", () => {
  it("targets an exact portrait iPhone screen with a media query", () => {
    const image = iosStartupImages().find((entry) => entry.url.includes("1320x2868"));

    expect(image?.media).toBe(
      "screen and (device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
    );
  });

  it("names each image by its physical pixel size", () => {
    const urls = iosStartupImages().map((entry) => entry.url);

    expect(urls).toContain("/splash/apple-splash-1170x2532.png");
    expect(urls).toContain("/splash/apple-splash-828x1792.png");
  });

  it("gives every screen a distinct media query so iOS picks exactly one", () => {
    const medias = iosStartupImages().map((entry) => entry.media);

    expect(new Set(medias).size).toBe(medias.length);
  });

  it("points every image at a file that exists in public/", () => {
    const missing = iosStartupImages()
      .map((entry) => entry.url)
      .filter((url) => !existsSync(resolve(publicDir, `.${url}`)));

    expect(missing).toEqual([]);
  });
});
