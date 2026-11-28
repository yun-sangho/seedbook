import { describe, expect, it } from "vitest";
import {
  bundleFitsNative,
  inRollout,
  isAppBundleId,
  parseLatestAppBundleResponse,
  rolloutBucket,
  shouldHaltBundle,
} from "./app-bundle";

const offer = {
  id: "abc123def456-42",
  appVersion: "1.0.0",
  build: "abc123def4567890",
  url: "/api/app-bundle/files/abc123def456-42",
  checksum: "a".repeat(64),
  signature: "c2lnbmF0dXJl",
};

describe("isAppBundleId", () => {
  it("accepts the id the publish script makes (sha prefix + run number)", () => {
    expect(isAppBundleId("abc123def456-42")).toBe(true);
  });

  it("rejects ids that could escape the bundle folder", () => {
    expect(isAppBundleId("../etc")).toBe(false);
  });

  it("rejects the id the plugin reserves", () => {
    expect(isAppBundleId("public")).toBe(false);
  });
});

describe("parseLatestAppBundleResponse", () => {
  it("reads an offered bundle", () => {
    expect(parseLatestAppBundleResponse({ bundle: offer, reset: false })).toEqual({
      bundle: offer,
      reset: false,
    });
  });

  it("reads 'nothing to get'", () => {
    expect(parseLatestAppBundleResponse({ bundle: null, reset: false })).toEqual({
      bundle: null,
      reset: false,
    });
  });

  it("reads a reset to the built-in bundle", () => {
    expect(parseLatestAppBundleResponse({ bundle: null, reset: true })).toEqual({
      bundle: null,
      reset: true,
    });
  });

  it("does nothing for a bundle with a malformed checksum", () => {
    expect(
      parseLatestAppBundleResponse({ bundle: { ...offer, checksum: "zz" }, reset: true })
    ).toEqual({ bundle: null, reset: false });
  });

  it("does nothing for a bundle served from another host", () => {
    expect(
      parseLatestAppBundleResponse({ bundle: { ...offer, url: "https://evil.example/b.zip" } })
    ).toEqual({ bundle: null, reset: false });
  });

  it("does nothing for a body that is not an object", () => {
    expect(parseLatestAppBundleResponse("oops")).toEqual({ bundle: null, reset: false });
  });
});

describe("bundleFitsNative", () => {
  const bundle = { appVersion: "1.2.0", minNative: "1.1.0" };

  it("fits a binary between minNative and the bundle's app version", () => {
    expect(bundleFitsNative(bundle, "1.1.5")).toBe(true);
  });

  it("does not go to a binary older than minNative (missing native plugins)", () => {
    expect(bundleFitsNative(bundle, "1.0.9")).toBe(false);
  });

  it("does not go to a binary newer than the bundle (would downgrade its screens)", () => {
    expect(bundleFitsNative(bundle, "1.3.0")).toBe(false);
  });

  it("does not go to a binary whose version is unknown", () => {
    expect(bundleFitsNative(bundle, "")).toBe(false);
  });
});

describe("rollout", () => {
  it("puts the same device and bundle in the same bucket every time", () => {
    expect(rolloutBucket("b-1", "device-a")).toBe(rolloutBucket("b-1", "device-a"));
  });

  it("spreads devices over the buckets", () => {
    const buckets = new Set(
      Array.from({ length: 200 }, (_, i) => rolloutBucket("b-1", `device-${i}`))
    );
    expect(buckets.size).toBeGreaterThan(60);
  });

  it("lets every device in at 100%, even without a device id", () => {
    expect(inRollout("b-1", null, 100)).toBe(true);
  });

  it("keeps a device without an id out of a partial rollout", () => {
    expect(inRollout("b-1", null, 50)).toBe(false);
  });

  it("lets no device in at 0%", () => {
    expect(inRollout("b-1", "device-a", 0)).toBe(false);
  });
});

describe("shouldHaltBundle", () => {
  const counts = { applied: 0, rolled_back: 0, verify_failed: 0, download_failed: 0 };

  it("halts when enough devices fail and the failure share is high", () => {
    expect(shouldHaltBundle({ ...counts, applied: 7, rolled_back: 2, verify_failed: 1 })).toBe(
      true
    );
  });

  it("does not halt on a couple of failures", () => {
    expect(shouldHaltBundle({ ...counts, rolled_back: 2 })).toBe(false);
  });

  it("does not halt when failures are a small share", () => {
    expect(shouldHaltBundle({ ...counts, applied: 100, rolled_back: 3 })).toBe(false);
  });

  it("does not count download failures (often just the network)", () => {
    expect(shouldHaltBundle({ ...counts, download_failed: 10 })).toBe(false);
  });
});
