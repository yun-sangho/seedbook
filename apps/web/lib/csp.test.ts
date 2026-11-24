import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, createCspNonce } from "./csp";

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

  it("allows Kakao profile images", () => {
    const policy = directives(buildContentSecurityPolicy({ nonce: "n", isDev: false }));

    expect(policy.get("img-src")).toContain("https://*.kakaocdn.net");
  });

  it("upgrades insecure requests in production but not on the http dev server", () => {
    const prod = directives(buildContentSecurityPolicy({ nonce: "n", isDev: false }));
    const dev = directives(buildContentSecurityPolicy({ nonce: "n", isDev: true }));

    expect(prod.has("upgrade-insecure-requests")).toBe(true);
    expect(dev.has("upgrade-insecure-requests")).toBe(false);
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
