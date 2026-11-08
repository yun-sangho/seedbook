import { describe, expect, it } from "vitest";
import { isIOSUserAgent, needsSeparateStorageNotice, resolveInstallMode } from "./pwa-install";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";

describe("isIOSUserAgent", () => {
  it("detects an iPhone", () => {
    expect(isIOSUserAgent(IPHONE_SAFARI)).toBe(true);
  });

  it("does not treat Android as iOS", () => {
    expect(isIOSUserAgent(ANDROID_CHROME)).toBe(false);
  });
});

describe("resolveInstallMode", () => {
  it("reports installed when already running as a standalone app", () => {
    expect(resolveInstallMode({ isStandalone: true, isIOS: false, hasPrompt: true })).toBe(
      "installed"
    );
  });

  it("offers the native prompt when the browser provided one", () => {
    expect(resolveInstallMode({ isStandalone: false, isIOS: false, hasPrompt: true })).toBe(
      "prompt"
    );
  });

  it("falls back to manual add-to-home-screen guidance on iOS", () => {
    expect(resolveInstallMode({ isStandalone: false, isIOS: true, hasPrompt: false })).toBe(
      "ios-manual"
    );
  });

  it("reports unavailable when there is no prompt and no iOS fallback", () => {
    expect(resolveInstallMode({ isStandalone: false, isIOS: false, hasPrompt: false })).toBe(
      "unavailable"
    );
  });
});

describe("needsSeparateStorageNotice", () => {
  it("warns iOS users on browser-only storage, since the home screen app has its own storage", () => {
    expect(needsSeparateStorageNotice({ isIOS: true, storageMode: "local" })).toBe(true);
  });

  it("stays quiet for iOS users on cloud storage (data follows the account)", () => {
    expect(needsSeparateStorageNotice({ isIOS: true, storageMode: "cloud" })).toBe(false);
  });

  it("stays quiet on Android, where the installed app shares Chrome storage", () => {
    expect(needsSeparateStorageNotice({ isIOS: false, storageMode: "local" })).toBe(false);
  });
});
