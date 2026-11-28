import { describe, expect, it } from "vitest";
import { corsHeaders, isNativeAppOrigin } from "./cors";

describe("isNativeAppOrigin", () => {
  it("accepts the iOS and Android Capacitor origins", () => {
    expect(isNativeAppOrigin("capacitor://localhost")).toBe(true);
    expect(isNativeAppOrigin("https://localhost")).toBe(true);
  });

  it("rejects other origins, including look-alikes", () => {
    expect(isNativeAppOrigin(null)).toBe(false);
    expect(isNativeAppOrigin("http://localhost")).toBe(false);
    expect(isNativeAppOrigin("https://localhost:8443")).toBe(false);
    expect(isNativeAppOrigin("https://localhost.evil.example")).toBe(false);
    expect(isNativeAppOrigin("https://seedbook.boogie.ing")).toBe(false);
  });
});

describe("corsHeaders", () => {
  it("returns null for an origin that is not the native app", () => {
    expect(
      corsHeaders({ origin: "https://evil.example", requestedHeaders: "authorization" }, true)
    ).toBeNull();
  });

  it("returns null for same-origin requests without an Origin header", () => {
    expect(corsHeaders({ origin: null, requestedHeaders: null }, false)).toBeNull();
  });

  it("echoes the app origin and exposes set-auth-token on actual requests", () => {
    const headers = corsHeaders({ origin: "capacitor://localhost", requestedHeaders: null }, false);
    expect(headers).toEqual({
      "Access-Control-Allow-Origin": "capacitor://localhost",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Expose-Headers": "set-auth-token",
      Vary: "Origin",
    });
  });

  it("allows the requested headers (Authorization included) on preflight", () => {
    const headers = corsHeaders(
      { origin: "https://localhost", requestedHeaders: "authorization, x-seedbook-account" },
      true
    );
    expect(headers?.["Access-Control-Allow-Headers"]).toBe("authorization, x-seedbook-account");
    expect(headers?.["Access-Control-Allow-Methods"]).toContain("POST");
    expect(headers?.["Access-Control-Max-Age"]).toBe("600");
  });

  it("falls back to Authorization and Content-Type when preflight names no headers", () => {
    const headers = corsHeaders({ origin: "https://localhost", requestedHeaders: null }, true);
    expect(headers?.["Access-Control-Allow-Headers"]).toBe("authorization, content-type");
  });
});
