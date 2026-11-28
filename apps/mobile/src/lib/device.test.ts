import { describe, expect, it } from "vitest";
import { decideMobileRoute, isNativeAppUserAgent, resolveDeviceKind } from "./device";

const IPAD_NATIVE_APP =
  "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 SeedbookApp/1";
const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

describe("isNativeAppUserAgent", () => {
  it("recognizes the marker the native shell appends to its WebView user agent", () => {
    expect(isNativeAppUserAgent(IPAD_NATIVE_APP)).toBe(true);
  });

  it("does not treat a regular mobile browser as the native app", () => {
    expect(isNativeAppUserAgent(IPHONE_SAFARI)).toBe(false);
  });

  it("handles a missing user agent", () => {
    expect(isNativeAppUserAgent(undefined)).toBe(false);
  });
});

describe("resolveDeviceKind", () => {
  it("treats a mobile user agent as mobile", () => {
    expect(resolveDeviceKind({ deviceType: "mobile" })).toBe("mobile");
  });

  it("treats tablets as mobile (the app UI is mobile only)", () => {
    expect(resolveDeviceKind({ deviceType: "tablet" })).toBe("mobile");
  });

  it("treats an unknown device type as desktop", () => {
    expect(resolveDeviceKind({ deviceType: undefined })).toBe("desktop");
  });

  it("ignores a leftover desktop override cookie (there is no desktop app UI any more)", () => {
    expect(resolveDeviceKind({ deviceType: "mobile", override: "desktop" })).toBe("mobile");
  });

  it("lets the override cookie force mobile on a desktop", () => {
    expect(resolveDeviceKind({ deviceType: undefined, override: "mobile" })).toBe("mobile");
  });

  it("serves the mobile UI to the native app even on a tablet (the app ships only the mobile UI)", () => {
    expect(resolveDeviceKind({ deviceType: "tablet", userAgent: IPAD_NATIVE_APP })).toBe("mobile");
  });

  it("ignores an invalid override value", () => {
    expect(resolveDeviceKind({ deviceType: "mobile", override: "tv" })).toBe("mobile");
  });
});

const APP_PAGES = [
  "/home",
  "/accounts",
  "/accounts/acc-1",
  "/portfolios",
  "/portfolios/abc-123",
  "/rebalancing",
  "/rebalancing/new",
  "/rebalancing/acc-1",
  "/rebalancing/acc-1/plan",
  "/rebalancing/sessions/s-1",
  "/rebalancing/sessions/s-1/trades/t-1",
  "/settings",
  "/settings/login-methods",
  "/settings/profile",
  "/settings/storage",
  "/settings/data",
  "/settings/notifications",
  "/settings/delete-account",
  "/settings/terms",
  "/settings/privacy",
  "/settings/terms/2026-11-25",
  "/settings/privacy/2026-11-25",
];

describe("decideMobileRoute", () => {
  it.each(APP_PAGES)("serves the app screen for %s on mobile", (pathname) => {
    expect(decideMobileRoute(pathname, "mobile")).toEqual({
      type: "rewrite",
      pathname: `/m${pathname}`,
    });
  });

  it.each([...APP_PAGES, "/assets", "/assets/investments/acc-1", "/admin"])(
    "sends desktop users of the app page %s to the landing page",
    (pathname) => {
      expect(decideMobileRoute(pathname, "desktop")).toEqual({ type: "redirect", pathname: "/" });
    }
  );

  it("keeps the landing page untouched on mobile (the app home is /home on the web)", () => {
    expect(decideMobileRoute("/", "mobile")).toEqual({ type: "pass" });
  });

  it("keeps the landing page on desktop", () => {
    expect(decideMobileRoute("/", "desktop")).toEqual({ type: "pass" });
  });

  it.each(["/privacy", "/terms", "/terms/2026-11-25", "/offline"])(
    "serves the site page %s as-is on mobile and desktop",
    (pathname) => {
      expect(decideMobileRoute(pathname, "mobile")).toEqual({ type: "pass" });
      expect(decideMobileRoute(pathname, "desktop")).toEqual({ type: "pass" });
    }
  );

  it("opens the native app on the home screen instead of the landing page", () => {
    expect(decideMobileRoute("/", "mobile", { nativeApp: true })).toEqual({
      type: "redirect",
      pathname: "/home",
    });
  });

  it.each([
    ["/assets", "/home"],
    ["/assets/investments", "/accounts"],
    ["/assets/investments/acc-1", "/accounts/acc-1"],
    ["/assets/portfolio", "/portfolios"],
    ["/assets/portfolio/abc-123", "/portfolios/abc-123"],
    ["/assets/rebalancing", "/rebalancing"],
    ["/assets/rebalancing/new", "/rebalancing/new"],
    ["/assets/rebalancing/acc-1/plan", "/rebalancing/acc-1/plan"],
    ["/assets/rebalancing/sessions/s-1/trades/t-1", "/rebalancing/sessions/s-1/trades/t-1"],
    ["/assets/settings", "/settings"],
    ["/assets/settings/login-methods", "/settings/login-methods"],
    ["/assets/settings/notifications", "/settings/notifications"],
    ["/assets/settings/terms/2026-11-25", "/settings/terms/2026-11-25"],
  ])("moves the old app path %s to %s", (legacy, current) => {
    expect(decideMobileRoute(legacy, "mobile")).toEqual({ type: "redirect", pathname: current });
  });

  it("moves an old app path the app no longer has to the home", () => {
    expect(decideMobileRoute("/assets/savings", "mobile")).toEqual({
      type: "redirect",
      pathname: "/home",
    });
  });

  it("sends an unknown page under an app section to the home", () => {
    expect(decideMobileRoute("/settings/storage/extra", "mobile")).toEqual({
      type: "redirect",
      pathname: "/home",
    });
    expect(decideMobileRoute("/accounts/acc-1/extra", "mobile")).toEqual({
      type: "redirect",
      pathname: "/home",
    });
  });

  it("sends the old admin page to the settings page", () => {
    expect(decideMobileRoute("/admin", "mobile")).toEqual({
      type: "redirect",
      pathname: "/settings",
    });
  });

  it("does not treat a path that merely shares a prefix as an app page", () => {
    expect(decideMobileRoute("/assetsfoo", "mobile")).toEqual({ type: "pass" });
    expect(decideMobileRoute("/homepage", "mobile")).toEqual({ type: "pass" });
  });

  it("strips direct /m access back to the public URL", () => {
    expect(decideMobileRoute("/m/accounts", "desktop")).toEqual({
      type: "redirect",
      pathname: "/accounts",
    });
    expect(decideMobileRoute("/m", "mobile")).toEqual({ type: "redirect", pathname: "/" });
  });
});
