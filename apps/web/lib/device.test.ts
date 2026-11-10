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

  it("rewrites a rebalancing session (to-do list) page into the mobile tree", () => {
    expect(decideMobileRoute("/assets/rebalancing/sessions/s-1", "mobile")).toEqual({
      type: "rewrite",
      pathname: "/m/assets/rebalancing/sessions/s-1",
    });
  });

  it("sends desktop users of a rebalancing session to the portfolio list", () => {
    expect(decideMobileRoute("/assets/rebalancing/sessions/s-1", "desktop")).toEqual({
      type: "redirect",
      pathname: "/assets/portfolio",
    });
  });

  it("rewrites a rebalancing trade entry page into the mobile tree", () => {
    expect(decideMobileRoute("/assets/rebalancing/sessions/s-1/trades/t-1", "mobile")).toEqual({
      type: "rewrite",
      pathname: "/m/assets/rebalancing/sessions/s-1/trades/t-1",
    });
  });

  it("sends desktop users of a rebalancing trade entry page to the portfolio list", () => {
    expect(decideMobileRoute("/assets/rebalancing/sessions/s-1/trades/t-1", "desktop")).toEqual({
      type: "redirect",
      pathname: "/assets/portfolio",
    });
  });

  it("sends desktop users of the rebalancing list to the portfolio list", () => {
    expect(decideMobileRoute("/assets/rebalancing", "desktop")).toEqual({
      type: "redirect",
      pathname: "/assets/portfolio",
    });
  });

  it("sends desktop users of an account rebalancing detail to the portfolio list", () => {
    // 상세 id 는 계좌 id 라 데스크탑 포트폴리오 상세로 매핑할 수 없다.
    expect(decideMobileRoute("/assets/rebalancing/acc-1", "desktop")).toEqual({
      type: "redirect",
      pathname: "/assets/portfolio",
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

  it("keeps the asset overview root as the desktop page on desktop", () => {
    expect(decideMobileRoute("/assets", "desktop")).toEqual({ type: "pass" });
  });

  it("redirects admin to the mobile home on mobile", () => {
    expect(decideMobileRoute("/admin", "mobile").type).toBe("redirect");
  });

  it("keeps the landing page untouched on mobile", () => {
    expect(decideMobileRoute("/", "mobile")).toEqual({ type: "pass" });
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
