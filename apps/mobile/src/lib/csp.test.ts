import { describe, expect, it } from "vitest";
import { buildAppContentSecurityPolicy, buildContentSecurityPolicy, createCspNonce } from "./csp";

function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, ...values] = part.split(/\s+/);
        return [name, values] as [string, string[]];
      })
  );
}

describe("buildContentSecurityPolicy", () => {
  it("allows only scripts carrying the request nonce (and what they load)", () => {
    const policy = directives(buildContentSecurityPolicy({ nonce: "abc123", isDev: false }));

    expect(policy.get("script-src")).toEqual(["'self'", "'nonce-abc123'", "'strict-dynamic'"]);
  });

  it("adds unsafe-eval in development only (React dev error stacks use eval)", () => {
    const dev = directives(buildContentSecurityPolicy({ nonce: "n", isDev: true }));
    const prod = directives(buildContentSecurityPolicy({ nonce: "n", isDev: false }));

    expect(dev.get("script-src")).toContain("'unsafe-eval'");
    expect(prod.get("script-src")).not.toContain("'unsafe-eval'");
  });

  it("blocks plugins, base tag hijacking and framing", () => {
    const policy = directives(buildContentSecurityPolicy({ nonce: "n", isDev: false }));

    expect(policy.get("object-src")).toEqual(["'none'"]);
    expect(policy.get("base-uri")).toEqual(["'self'"]);
    expect(policy.get("frame-ancestors")).toEqual(["'none'"]);
    expect(policy.get("form-action")).toEqual(["'self'"]);
  });

  it("limits network requests to the same origin", () => {
    const policy = directives(buildContentSecurityPolicy({ nonce: "n", isDev: false }));

    expect(policy.get("default-src")).toEqual(["'self'"]);
    expect(policy.get("connect-src")).toEqual(["'self'"]);
  });

  it("loads images only from the same origin (no Kakao profile images)", () => {
    const policy = directives(buildContentSecurityPolicy({ nonce: "n", isDev: false }));

    expect(policy.get("img-src")).toEqual(["'self'", "blob:", "data:"]);
  });

  it("upgrades insecure requests in production but not on the http dev server", () => {
    const prod = directives(buildContentSecurityPolicy({ nonce: "n", isDev: false }));
    const dev = directives(buildContentSecurityPolicy({ nonce: "n", isDev: true }));

    expect(prod.has("upgrade-insecure-requests")).toBe(true);
    expect(dev.has("upgrade-insecure-requests")).toBe(false);
  });
});

describe("buildAppContentSecurityPolicy", () => {
  it("allows the app bundle's own scripts without a nonce (index.html is a static file)", () => {
    const policy = directives(buildAppContentSecurityPolicy({ isDev: false, meta: false }));

    expect(policy.get("script-src")).toEqual(["'self'"]);
  });

  it("keeps the same limits as the page policy for everything but scripts", () => {
    const app = directives(buildAppContentSecurityPolicy({ isDev: false, meta: false }));
    const page = directives(buildContentSecurityPolicy({ nonce: "n", isDev: false }));
    app.delete("script-src");
    page.delete("script-src");

    expect(app).toEqual(page);
  });

  it("leaves out frame-ancestors in the <meta> form (browsers ignore it there)", () => {
    const meta = directives(buildAppContentSecurityPolicy({ isDev: false, meta: true }));

    expect(meta.has("frame-ancestors")).toBe(false);
    expect(meta.get("object-src")).toEqual(["'none'"]);
  });

  it("lets the app bundle reach its API server", () => {
    const meta = directives(
      buildAppContentSecurityPolicy({
        isDev: false,
        meta: true,
        apiOrigins: ["https://seedbook.boogie.ing"],
      })
    );

    expect(meta.get("connect-src")).toEqual(["'self'", "https://seedbook.boogie.ing"]);
  });
});

describe("createCspNonce", () => {
  it("returns a base64 value that differs on every call", () => {
    const first = createCspNonce();
    const second = createCspNonce();

    expect(first).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(first).not.toBe(second);
  });
});
