import { describe, expect, it, vi } from "vitest";
import { checkUpdateRequired, fetchAppConfig, storeUrlFor } from "./app-update";

const config = { minSupportedVersion: "1.2.0", latestVersion: "1.3.0" };

describe("checkUpdateRequired", () => {
  it("blocks a bundled app older than the minimum supported version", async () => {
    const required = await checkUpdateRequired({
      bundled: true,
      appVersion: "1.1.0",
      fetchConfig: async () => config,
    });

    expect(required).toBe(true);
  });

  it("lets a bundled app at the minimum version through", async () => {
    const required = await checkUpdateRequired({
      bundled: true,
      appVersion: "1.2.0",
      fetchConfig: async () => config,
    });

    expect(required).toBe(false);
  });

  it("never blocks the browser or the old app shell (their screens come from the server)", async () => {
    const fetchConfig = vi.fn(async () => config);

    const required = await checkUpdateRequired({
      bundled: false,
      appVersion: "0.0.1",
      fetchConfig,
    });

    expect(required).toBe(false);
    expect(fetchConfig).not.toHaveBeenCalled();
  });

  it("does not block when the config could not be fetched (offline)", async () => {
    const required = await checkUpdateRequired({
      bundled: true,
      appVersion: "0.0.1",
      fetchConfig: async () => null,
    });

    expect(required).toBe(false);
  });
});

describe("fetchAppConfig", () => {
  it("reads the server's versions", async () => {
    const fetchImpl = vi.fn(async () => Response.json(config));

    expect(await fetchAppConfig(fetchImpl)).toEqual(config);
    expect(fetchImpl).toHaveBeenCalledWith("/api/app-config", expect.anything());
  });

  it("returns null on a server error", async () => {
    const fetchImpl = vi.fn(async () => new Response("bad gateway", { status: 502 }));

    expect(await fetchAppConfig(fetchImpl)).toBeNull();
  });

  it("returns null on a network error", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Load failed");
    });

    expect(await fetchAppConfig(fetchImpl)).toBeNull();
  });
});

describe("storeUrlFor", () => {
  it("sends Android to Google Play", () => {
    expect(storeUrlFor("Mozilla/5.0 (Linux; Android 15) SeedbookApp/1")).toContain(
      "play.google.com"
    );
  });
});
