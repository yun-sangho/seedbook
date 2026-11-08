import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { decideMobileRoute } from "@web/lib/device";
import { describe, expect, it } from "vitest";
import manifest from "./manifest";

const publicDir = resolve(__dirname, "../public");

function publicFileExists(src: string): boolean {
  return existsSync(resolve(publicDir, `.${src}`));
}

describe("web app manifest", () => {
  it("provides maskable icons at 192 and 512 for Android adaptive launchers", () => {
    const maskableSizes = (manifest().icons ?? [])
      .filter((icon) => icon.purpose === "maskable")
      .map((icon) => icon.sizes);

    expect(maskableSizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  });

  it("points every icon at a file that exists in public/", () => {
    const missing = (manifest().icons ?? [])
      .map((icon) => icon.src)
      .filter((src) => !publicFileExists(src));

    expect(missing).toEqual([]);
  });

  it("only offers shortcuts that render on mobile without redirecting away", () => {
    const shortcuts = manifest().shortcuts ?? [];

    expect(shortcuts.length).toBeGreaterThan(0);
    for (const shortcut of shortcuts) {
      expect(decideMobileRoute(shortcut.url, "mobile").type).toBe("rewrite");
    }
  });

  it("only offers shortcuts that desktop renders as-is", () => {
    for (const shortcut of manifest().shortcuts ?? []) {
      expect(decideMobileRoute(shortcut.url, "desktop").type).toBe("pass");
    }
  });

  it("points every shortcut icon at a file that exists in public/", () => {
    const missing = (manifest().shortcuts ?? [])
      .flatMap((shortcut) => shortcut.icons ?? [])
      .map((icon) => icon.src)
      .filter((src) => !publicFileExists(src));

    expect(missing).toEqual([]);
  });
});
