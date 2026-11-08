import { describe, expect, it } from "vitest";
import { decideMobileRoute, resolveDeviceKind } from "./device";

describe("resolveDeviceKind", () => {
  it("treats a mobile user agent as mobile", () => {
    expect(resolveDeviceKind({ deviceType: "mobile" })).toBe("mobile");
  });

  it("treats tablets as desktop (iPad layouts have room for the desktop UI)", () => {
    expect(resolveDeviceKind({ deviceType: "tablet" })).toBe("desktop");
  });

  it("treats an unknown device type as desktop", () => {
    expect(resolveDeviceKind({ deviceType: undefined })).toBe("desktop");
  });

  it("lets the override cookie force desktop on a phone", () => {
    expect(resolveDeviceKind({ deviceType: "mobile", override: "desktop" })).toBe("desktop");
  });

  it("lets the override cookie force mobile on a desktop", () => {
    expect(resolveDeviceKind({ deviceType: undefined, override: "mobile" })).toBe("mobile");
  });

  it("ignores an invalid override value", () => {
    expect(resolveDeviceKind({ deviceType: "mobile", override: "tv" })).toBe("mobile");
  });
});

describe("decideMobileRoute", () => {
  it("passes every path through untouched on desktop", () => {
    expect(decideMobileRoute("/assets/savings", "desktop")).toEqual({ type: "pass" });
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

  it("sends desktop users of a mobile-only account detail URL to the investments list", () => {
    expect(decideMobileRoute("/assets/investments/acc-1", "desktop")).toEqual({
      type: "redirect",
      pathname: "/assets/investments",
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

  it("redirects unsupported app pages to investments on mobile", () => {
    expect(decideMobileRoute("/assets/savings", "mobile")).toEqual({
      type: "redirect",
      pathname: "/assets/investments",
    });
  });

  it("redirects the asset overview root to investments on mobile", () => {
    expect(decideMobileRoute("/assets", "mobile")).toEqual({
      type: "redirect",
      pathname: "/assets/investments",
    });
  });

  it("redirects asset-plan-list and admin to investments on mobile", () => {
    expect(decideMobileRoute("/asset-plan-list", "mobile").type).toBe("redirect");
    expect(decideMobileRoute("/admin", "mobile").type).toBe("redirect");
  });

  it("keeps the landing page and invite links untouched on mobile", () => {
    expect(decideMobileRoute("/", "mobile")).toEqual({ type: "pass" });
    expect(decideMobileRoute("/invite/tok", "mobile")).toEqual({ type: "pass" });
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
