import { CSP_NONCE_HEADER } from "@web/lib/csp";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SiteLayout from "./layout";

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
