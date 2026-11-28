import { afterEach, describe, expect, it, vi } from "vitest";
import { bundledAppPath, isBundledApp, isBundledAppOrigin } from "./bundled-app";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isBundledAppOrigin", () => {
  it("treats the iOS app origin (capacitor://localhost) as the bundle", () => {
    expect(isBundledAppOrigin({ protocol: "capacitor:", hostname: "localhost" })).toBe(true);
  });

  it("treats the Android app origin (https://localhost) as the bundle", () => {
    expect(isBundledAppOrigin({ protocol: "https:", hostname: "localhost" })).toBe(true);
  });

  it("does not treat the production server origin as the bundle (old app shell)", () => {
    expect(isBundledAppOrigin({ protocol: "https:", hostname: "seedbook.boogie.ing" })).toBe(false);
  });

  it("does not treat an http dev server as the bundle (live reload)", () => {
    expect(isBundledAppOrigin({ protocol: "http:", hostname: "localhost" })).toBe(false);
  });
});

describe("isBundledApp", () => {
  it("is false in a browser without the Capacitor bridge", () => {
    expect(isBundledApp()).toBe(false);
  });

  it("is false for a native shell whose page comes from a server (jsdom origin is http://localhost)", () => {
    vi.stubGlobal("Capacitor", { isNativePlatform: () => true });

    expect(isBundledApp()).toBe(false);
  });
});

describe("bundledAppPath", () => {
  it("opens home when the app shell starts at /", () => {
    expect(bundledAppPath("/")).toBe("/home");
  });

  it("keeps a supported app path", () => {
    expect(bundledAppPath("/accounts/abc")).toBe("/accounts/abc");
  });

  it("drops a trailing slash", () => {
    expect(bundledAppPath("/portfolios/")).toBe("/portfolios");
  });

  it("sends paths outside the app (the intro site and its terms) home — they are not in the bundle", () => {
    expect(bundledAppPath("/terms")).toBe("/home");
  });

  it.each([
    ["/assets", "/home"],
    ["/assets/investments/abc", "/accounts/abc"],
    ["/assets/portfolio/", "/portfolios"],
    ["/assets/rebalancing/acc-1/plan", "/rebalancing/acc-1/plan"],
    ["/assets/settings/notifications", "/settings/notifications"],
  ])("moves an old app path (an older bundle or link) %s to %s", (legacy, current) => {
    expect(bundledAppPath(legacy)).toBe(current);
  });

  it("follows the old /m tree prefix to its public path", () => {
    expect(bundledAppPath("/m/assets/settings")).toBe("/settings");
  });
});
