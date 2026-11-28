import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { iosStartupImages } from "./ios-splash";

// 스플래시 이미지는 웹 서버(apps/web/public)가 준다 — 앱 index.html 은 같은 origin 의 경로만 적는다.
const publicDir = resolve(__dirname, "../../../web/public");

describe("iosStartupImages", () => {
  it("targets an exact portrait iPhone screen in light mode with a media query", () => {
    const image = iosStartupImages().find(
      (entry) => entry.url === "/splash/apple-splash-1320x2868.png"
    );

    expect(image?.media).toBe(
      "screen and (device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait) and (prefers-color-scheme: light)"
    );
  });

  it("gives every screen a dark splash so dark mode does not flash white", () => {
    const image = iosStartupImages().find(
      (entry) => entry.url === "/splash/apple-splash-1320x2868-dark.png"
    );

    expect(image?.media).toBe(
      "screen and (device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait) and (prefers-color-scheme: dark)"
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
