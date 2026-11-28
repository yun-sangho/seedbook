import { describe, expect, it } from "vitest";
import { compareAppVersions, isAppVersionBlocked, parseAppConfig } from "./app-version";

describe("compareAppVersions", () => {
  it("compares each part as a number, not as text", () => {
    expect(compareAppVersions("1.10.0", "1.9.0")).toBeGreaterThan(0);
  });

  it("is zero for the same version", () => {
    expect(compareAppVersions("2.0.1", "2.0.1")).toBe(0);
  });

  it("is negative when the first is older", () => {
    expect(compareAppVersions("1.0.0", "1.0.1")).toBeLessThan(0);
  });

  it("returns null for a version that is not major.minor.patch", () => {
    expect(compareAppVersions("1.0", "1.0.0")).toBeNull();
  });
});

describe("parseAppConfig", () => {
  it("reads both versions", () => {
    expect(parseAppConfig({ minSupportedVersion: "1.0.0", latestVersion: "1.2.0" })).toEqual({
      minSupportedVersion: "1.0.0",
      latestVersion: "1.2.0",
    });
  });

  it("rejects a body with a malformed version", () => {
    expect(parseAppConfig({ minSupportedVersion: "latest", latestVersion: "1.2.0" })).toBeNull();
  });

  it("rejects a body that is not an object", () => {
    expect(parseAppConfig(null)).toBeNull();
  });
});

describe("isAppVersionBlocked", () => {
  const config = { minSupportedVersion: "1.2.0", latestVersion: "1.3.0" };

  it("blocks an app older than the minimum supported version", () => {
    expect(isAppVersionBlocked("1.1.9", config)).toBe(true);
  });

  it("lets the minimum supported version through", () => {
    expect(isAppVersionBlocked("1.2.0", config)).toBe(false);
  });

  it("does not block when the config is unknown (offline, server error)", () => {
    expect(isAppVersionBlocked("0.0.1", null)).toBe(false);
  });

  it("does not block when the app version is unknown", () => {
    expect(isAppVersionBlocked("", config)).toBe(false);
  });
});
