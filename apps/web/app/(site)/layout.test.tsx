import { CSP_NONCE_HEADER } from "@web/lib/csp";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SiteLayout, { generateViewport } from "./layout";

const requestHeaders = vi.hoisted(() => ({ current: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => requestHeaders.current }));

async function renderLayout() {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(await SiteLayout({ children: <p>본문</p> }));
  return host;
}

describe("SiteLayout", () => {
  beforeEach(() => {
    requestHeaders.current = new Headers();
  });

  it("puts the request CSP nonce on every inline script", async () => {
    requestHeaders.current = new Headers({ [CSP_NONCE_HEADER]: "test-nonce" });
    const scripts = [...(await renderLayout()).querySelectorAll("script")];
    expect(scripts.map((script) => script.getAttribute("nonce"))).toEqual(["test-nonce"]);
  });

  it("renders the page without a nonce when the proxy did not set one", async () => {
    const host = await renderLayout();
    expect(host.textContent).toContain("본문");
    expect(host.querySelector("script")?.hasAttribute("nonce")).toBe(false);
  });
});

describe("site viewport", () => {
  async function viewportFitFor(userAgent: string) {
    requestHeaders.current = new Headers({ "user-agent": userAgent });
    return (await generateViewport()).viewportFit;
  }

  it.each([
    [
      "iPhone app",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 SeedbookApp/1",
    ],
    [
      "iPad app with a desktop-class user agent",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) SeedbookApp/1",
    ],
  ])("covers the safe area in the %s", async (_name, userAgent) => {
    expect(await viewportFitFor(userAgent)).toBe("cover");
  });

  it.each([
    [
      "Android app",
      "Mozilla/5.0 (Linux; Android 16; Pixel 9 Build/BP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36 SeedbookApp/1",
    ],
    [
      "iPhone Safari or home screen app",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Mobile/15E148 Safari/604.1",
    ],
    [
      "desktop browser",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    ],
  ])("keeps the default viewport in the %s", async (_name, userAgent) => {
    expect(await viewportFitFor(userAgent)).toBeUndefined();
  });

  it("keeps the default viewport when there is no user agent", async () => {
    requestHeaders.current = new Headers();
    expect((await generateViewport()).viewportFit).toBeUndefined();
  });
});
