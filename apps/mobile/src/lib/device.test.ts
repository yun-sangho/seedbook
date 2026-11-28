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

describe("decideMobileRoute", () => {
  it.each([
    "/assets",
    "/assets/investments",
    "/assets/investments/acc-1",
    "/assets/portfolio",
    "/assets/portfolio/abc-123",
    "/assets/rebalancing",
    "/assets/rebalancing/acc-1",
    "/assets/rebalancing/acc-1/plan",
    "/assets/rebalancing/sessions/s-1",
    "/assets/rebalancing/sessions/s-1/trades/t-1",
    "/assets/settings",
    "/admin",
  ])("sends desktop users of the app page %s to the landing page", (pathname) => {
    expect(decideMobileRoute(pathname, "desktop")).toEqual({ type: "redirect", pathname: "/" });
  });

  it("keeps the landing page on desktop", () => {
    expect(decideMobileRoute("/", "desktop")).toEqual({ type: "pass" });
  });

  it("serves the public privacy policy as-is on desktop", () => {
    expect(decideMobileRoute("/privacy", "desktop")).toEqual({ type: "pass" });
  });

  it("rewrites the investments page into the mobile tree", () => {
    expect(decideMobileRoute("/assets/investments", "mobile")).toEqual({
      type: "rewrite",
      pathname: "/m/assets/investments",
    });
  });

  it("rewrites an investment account detail page into the mobile tree", () => {
    expect(decideMobileRoute("/assets/investments/acc-1", "mobile")).toEqual({
      type: "rewrite",
      pathname: "/m/assets/investments/acc-1",
    });
  });

  it("rewrites the portfolio list into the mobile tree", () => {
    expect(decideMobileRoute("/assets/portfolio", "mobile")).toEqual({
      type: "rewrite",
      pathname: "/m/assets/portfolio",
    });
  });

  it("rewrites a portfolio detail page into the mobile tree", () => {
    expect(decideMobileRoute("/assets/portfolio/abc-123", "mobile")).toEqual({
      type: "rewrite",
      pathname: "/m/assets/portfolio/abc-123",
    });
  });

  it("rewrites the rebalancing list into the mobile tree", () => {
    expect(decideMobileRoute("/assets/rebalancing", "mobile")).toEqual({
      type: "rewrite",
      pathname: "/m/assets/rebalancing",
    });
  });

  it("rewrites a rebalancing detail page into the mobile tree", () => {
    expect(decideMobileRoute("/assets/rebalancing/abc-123", "mobile")).toEqual({
      type: "rewrite",
      pathname: "/m/assets/rebalancing/abc-123",
    });
  });

  it("rewrites a rebalancing plan (step 2) page into the mobile tree", () => {
    expect(decideMobileRoute("/assets/rebalancing/abc-123/plan", "mobile")).toEqual({
      type: "rewrite",
      pathname: "/m/assets/rebalancing/abc-123/plan",
    });
  });

  it("rewrites a rebalancing session (to-do list) page into the mobile tree", () => {
    expect(decideMobileRoute("/assets/rebalancing/sessions/s-1", "mobile")).toEqual({
      type: "rewrite",
      pathname: "/m/assets/rebalancing/sessions/s-1",
    });
  });

  it("rewrites a rebalancing trade entry page into the mobile tree", () => {
    expect(decideMobileRoute("/assets/rebalancing/sessions/s-1/trades/t-1", "mobile")).toEqual({
      type: "rewrite",
      pathname: "/m/assets/rebalancing/sessions/s-1/trades/t-1",
    });
  });

  it("redirects unsupported app pages to the mobile home on mobile", () => {
    expect(decideMobileRoute("/assets/savings", "mobile")).toEqual({
      type: "redirect",
      pathname: "/assets",
    });
  });

  it("rewrites the asset overview root into the mobile home", () => {
    expect(decideMobileRoute("/assets", "mobile")).toEqual({
      type: "rewrite",
      pathname: "/m/assets",
    });
  });

  it("rewrites the settings page into the mobile tree", () => {
    expect(decideMobileRoute("/assets/settings", "mobile")).toEqual({
      type: "rewrite",
      pathname: "/m/assets/settings",
    });
  });

  it("rewrites the login methods page into the mobile tree (link sign-in returns here)", () => {
    expect(decideMobileRoute("/assets/settings/login-methods", "mobile")).toEqual({
      type: "rewrite",
      pathname: "/m/assets/settings/login-methods",
    });
  });

  it.each([
    "/assets/settings/profile",
    "/assets/settings/storage",
    "/assets/settings/data",
    "/assets/settings/notifications",
    "/assets/settings/delete-account",
    "/assets/settings/terms",
    "/assets/settings/privacy",
    "/assets/settings/terms/2026-11-25",
    "/assets/settings/privacy/2026-11-25",
  ])("rewrites the settings sub screen %s into the mobile tree", (pathname) => {
    expect(decideMobileRoute(pathname, "mobile")).toEqual({
      type: "rewrite",
      pathname: `/m${pathname}`,
    });
  });

  it("sends an unknown settings sub path to the mobile home", () => {
    expect(decideMobileRoute("/assets/settings/storage/extra", "mobile")).toEqual({
      type: "redirect",
      pathname: "/assets",
    });
  });

  it("sends the old admin page to the mobile settings page", () => {
    expect(decideMobileRoute("/admin", "mobile")).toEqual({
      type: "redirect",
      pathname: "/assets/settings",
    });
  });

  it("opens the native app on the home screen instead of the marketing landing page", () => {
    expect(decideMobileRoute("/", "mobile", { nativeApp: true })).toEqual({
      type: "redirect",
      pathname: "/assets",
    });
  });

  it("keeps the landing page untouched on mobile", () => {
    expect(decideMobileRoute("/", "mobile")).toEqual({ type: "pass" });
  });

  it("serves the public privacy policy as-is on mobile", () => {
    expect(decideMobileRoute("/privacy", "mobile")).toEqual({ type: "pass" });
  });

  it("does not treat a path that merely shares a prefix as an app page", () => {
    expect(decideMobileRoute("/assetsfoo", "mobile")).toEqual({ type: "pass" });
  });

  it("strips direct /m access back to the public URL", () => {
    expect(decideMobileRoute("/m/assets/investments", "desktop")).toEqual({
      type: "redirect",
      pathname: "/assets/investments",
    });
    expect(decideMobileRoute("/m", "mobile")).toEqual({ type: "redirect", pathname: "/" });
  });
});
