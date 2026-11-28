import { describe, expect, it, vi } from "vitest";
import {
  createNonce,
  NATIVE_LOGIN_CANCELLED,
  type NativeIdTokenPlugin,
  nativeIdTokenSignIn,
} from "./social-login";

function fakePlugin(overrides: Partial<NativeIdTokenPlugin> = {}): NativeIdTokenPlugin {
  return {
    isAvailable: vi.fn(async () => ({ available: true })),
    signIn: vi.fn(async () => ({ idToken: "header.payload.signature" })),
    ...overrides,
  };
}

describe("nativeIdTokenSignIn", () => {
  it("returns null without the plugin so the web OAuth flow runs (browser, older app)", async () => {
    expect(await nativeIdTokenSignIn(async () => null)).toBeNull();
  });

  it("returns null when the SDK is not set up on this build", async () => {
    const plugin = fakePlugin({ isAvailable: vi.fn(async () => ({ available: false })) });

    expect(await nativeIdTokenSignIn(async () => ({ plugin }))).toBeNull();
    expect(plugin.signIn).not.toHaveBeenCalled();
  });

  it("returns the id token with the nonce it asked the SDK to sign", async () => {
    const plugin = fakePlugin();

    const result = await nativeIdTokenSignIn(async () => ({ plugin }), "nonce-1");

    expect(plugin.signIn).toHaveBeenCalledWith({ nonce: "nonce-1" });
    expect(result).toEqual({
      status: "ok",
      idToken: { token: "header.payload.signature", nonce: "nonce-1" },
    });
  });

  it("reports a cancelled login apart from a failure", async () => {
    const cancelled = fakePlugin({
      signIn: vi.fn(async () => {
        throw Object.assign(new Error("user cancelled"), { code: NATIVE_LOGIN_CANCELLED });
      }),
    });
    const failed = fakePlugin({
      signIn: vi.fn(async () => {
        throw new Error("KakaoTalk crashed");
      }),
    });

    expect(await nativeIdTokenSignIn(async () => ({ plugin: cancelled }))).toEqual({
      status: "cancelled",
    });
    expect(await nativeIdTokenSignIn(async () => ({ plugin: failed }))).toEqual({
      status: "failed",
    });
  });

  it("fails when the SDK hands back an empty token", async () => {
    const plugin = fakePlugin({ signIn: vi.fn(async () => ({ idToken: "" })) });

    expect(await nativeIdTokenSignIn(async () => ({ plugin }))).toEqual({ status: "failed" });
  });
});

describe("createNonce", () => {
  it("makes a fresh URL-safe value each time", () => {
    const first = createNonce();
    const second = createNonce();

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
  });
});
