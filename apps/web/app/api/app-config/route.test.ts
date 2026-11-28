import { compareAppVersions, parseAppConfig } from "@seedbook/domain/app-version";
import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/app-config", () => {
  it("returns the supported and latest app versions in the shape the app reads", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(parseAppConfig(await response.json())).not.toBeNull();
  });

  it("never asks for a minimum newer than the latest released version", async () => {
    const config = parseAppConfig(await GET().json());

    expect(config).not.toBeNull();
    if (!config) return;
    expect(
      compareAppVersions(config.minSupportedVersion, config.latestVersion)
    ).toBeLessThanOrEqual(0);
  });

  it("is not cached (a raised minimum must reach apps right away)", () => {
    expect(GET().headers.get("cache-control")).toBe("no-store");
  });
});
