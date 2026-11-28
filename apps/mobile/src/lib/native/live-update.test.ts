import type { AppBundleOffer, LatestAppBundleResponse } from "@seedbook/domain/app-bundle";
import { describe, expect, it, vi } from "vitest";
import { createLiveUpdate, type LiveUpdatePlugin, STATE_KEYS } from "./live-update";

const offer: AppBundleOffer = {
  id: "abc123def456-7",
  appVersion: "1.0.0",
  build: "abc123def4567890",
  url: "/api/app-bundle/files/abc123def456-7",
  checksum: "a".repeat(64),
  signature: "c2ln",
};

interface Setup {
  channel?: string | null;
  current?: string | null;
  next?: string | null;
  downloaded?: string[];
  latest?: LatestAppBundleResponse;
  downloadError?: Error;
  flushed?: boolean;
  appBuild?: string;
  state?: Record<string, string>;
  ready?: Awaited<ReturnType<LiveUpdatePlugin["ready"]>>;
}

function setup(options: Setup = {}) {
  const values = new Map(Object.entries(options.state ?? {}));
  const plugin = {
    ready: vi.fn(
      async () =>
        options.ready ?? { previousBundleId: null, currentBundleId: null, rollback: false }
    ),
    getChannel: vi.fn(async () => ({
      channel: options.channel === undefined ? "production" : options.channel,
    })),
    setChannel: vi.fn(async () => undefined),
    getCurrentBundle: vi.fn(async () => ({ bundleId: options.current ?? null })),
    getNextBundle: vi.fn(async () => ({ bundleId: options.next ?? null })),
    getBundles: vi.fn(async () => ({ bundleIds: options.downloaded ?? [] })),
    downloadBundle: vi.fn(async () => {
      if (options.downloadError) throw options.downloadError;
    }),
    setNextBundle: vi.fn(async () => undefined),
    reset: vi.fn(async () => undefined),
  } satisfies LiveUpdatePlugin;
  const reports: Array<[string, string]> = [];
  const fetchLatest = vi.fn(async () => options.latest ?? { bundle: offer, reset: false });
  const prepareSwitch = vi.fn(async () => options.flushed ?? true);
  const liveUpdate = createLiveUpdate({
    plugin,
    nativeVersion: async () => "1.0.0",
    appBuild: options.appBuild ?? "built-in-sha",
    state: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => void values.set(key, value),
      removeItem: (key) => void values.delete(key),
    },
    fetchLatest,
    report: async (bundleId, _installId, outcome) => void reports.push([bundleId, outcome]),
    prepareSwitch,
    resolveUrl: (path) => `https://api.example${path}`,
    randomId: () => "install-0001",
  });
  return { liveUpdate, plugin, values, reports, fetchLatest, prepareSwitch };
}

describe("checking for a bundle", () => {
  it("downloads the offered bundle and uses it from the next launch", async () => {
    const { liveUpdate, plugin } = setup();

    expect(await liveUpdate.check()).toBe("scheduled");
    expect(plugin.downloadBundle).toHaveBeenCalledWith({
      bundleId: offer.id,
      url: `https://api.example${offer.url}`,
      checksum: offer.checksum,
      signature: offer.signature,
      artifactType: "zip",
    });
    expect(plugin.setNextBundle).toHaveBeenCalledWith({ bundleId: offer.id });
  });

  it("asks with the binary version, channel, current bundle and a stable device id", async () => {
    const { liveUpdate, fetchLatest } = setup({ channel: "beta", current: "old-1" });

    await liveUpdate.check();

    expect(fetchLatest).toHaveBeenCalledWith({
      native: "1.0.0",
      channel: "beta",
      current: "old-1",
      device: "install-0001",
    });
  });

  it("saves pending writes and snapshots before switching bundles", async () => {
    const { liveUpdate, prepareSwitch, plugin } = setup();

    await liveUpdate.check();

    expect(prepareSwitch).toHaveBeenCalled();
    expect(prepareSwitch.mock.invocationCallOrder[0]).toBeLessThan(
      plugin.setNextBundle.mock.invocationCallOrder[0] as number
    );
  });

  it("does not switch when pending writes could not be saved", async () => {
    const { liveUpdate, plugin } = setup({ flushed: false });

    expect(await liveUpdate.check()).toBe("deferred");
    expect(plugin.setNextBundle).not.toHaveBeenCalled();
  });

  it("does nothing on a binary built without OTA (no channel)", async () => {
    const { liveUpdate, fetchLatest } = setup({ channel: null });

    expect(await liveUpdate.check()).toBe("disabled");
    expect(fetchLatest).not.toHaveBeenCalled();
  });

  it("does nothing when the server has no bundle", async () => {
    const { liveUpdate, plugin } = setup({ latest: { bundle: null, reset: false } });

    expect(await liveUpdate.check()).toBe("none");
    expect(plugin.downloadBundle).not.toHaveBeenCalled();
  });

  it("does nothing when already on the offered bundle", async () => {
    const { liveUpdate, plugin } = setup({ current: offer.id });

    expect(await liveUpdate.check()).toBe("current");
    expect(plugin.downloadBundle).not.toHaveBeenCalled();
  });

  it("does not download the build the binary already carries", async () => {
    const { liveUpdate, plugin } = setup({ appBuild: offer.build });

    expect(await liveUpdate.check()).toBe("current");
    expect(plugin.downloadBundle).not.toHaveBeenCalled();
  });

  it("does not download again a bundle already set for the next launch", async () => {
    const { liveUpdate, plugin } = setup({ next: offer.id });

    expect(await liveUpdate.check()).toBe("pending");
    expect(plugin.downloadBundle).not.toHaveBeenCalled();
  });

  it("reuses a bundle already on the device", async () => {
    const { liveUpdate, plugin } = setup({ downloaded: [offer.id] });

    expect(await liveUpdate.check()).toBe("scheduled");
    expect(plugin.downloadBundle).not.toHaveBeenCalled();
  });

  it("reports a checksum or signature failure and never tries that bundle again", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { liveUpdate, plugin, reports, values } = setup({
      downloadError: new Error("Signature verification failed."),
    });

    expect(await liveUpdate.check()).toBe("verify_failed");
    expect(plugin.setNextBundle).not.toHaveBeenCalled();
    expect(reports).toEqual([[offer.id, "verify_failed"]]);
    expect(JSON.parse(values.get(STATE_KEYS.failed) ?? "[]")).toEqual([offer.id]);
  });

  it("retries a bundle whose download failed on the network", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { liveUpdate, reports, values } = setup({ downloadError: new Error("timed out") });

    expect(await liveUpdate.check()).toBe("download_failed");
    expect(reports).toEqual([[offer.id, "download_failed"]]);
    expect(values.has(STATE_KEYS.failed)).toBe(false);
  });

  it("skips a bundle that failed on this device before", async () => {
    const { liveUpdate, plugin } = setup({
      state: { [STATE_KEYS.failed]: JSON.stringify([offer.id]) },
    });

    expect(await liveUpdate.check()).toBe("blocked");
    expect(plugin.downloadBundle).not.toHaveBeenCalled();
  });

  it("goes back to the built-in bundle when the current bundle was halted", async () => {
    const { liveUpdate, plugin } = setup({
      current: "halted-1",
      latest: { bundle: null, reset: true },
    });

    expect(await liveUpdate.check()).toBe("reset");
    expect(plugin.reset).toHaveBeenCalled();
  });
});

describe("marking the app ready", () => {
  it("reports the bundle set last time as applied when the app starts on it", async () => {
    const { liveUpdate, reports, values } = setup({
      state: { [STATE_KEYS.pending]: offer.id },
      ready: { previousBundleId: null, currentBundleId: offer.id, rollback: false },
    });

    await liveUpdate.markReady();

    expect(reports).toEqual([[offer.id, "applied"]]);
    expect(values.has(STATE_KEYS.pending)).toBe(false);
  });

  it("reports a rollback when the app started on another bundle, and blocks it", async () => {
    const { liveUpdate, reports, values } = setup({
      state: { [STATE_KEYS.pending]: offer.id },
      ready: { previousBundleId: offer.id, currentBundleId: null, rollback: true },
    });

    await liveUpdate.markReady();

    expect(reports).toEqual([[offer.id, "rolled_back"]]);
    expect(JSON.parse(values.get(STATE_KEYS.failed) ?? "[]")).toEqual([offer.id]);
  });

  it("reports nothing on an ordinary launch", async () => {
    const { liveUpdate, reports, plugin } = setup();

    await liveUpdate.markReady();

    expect(plugin.ready).toHaveBeenCalled();
    expect(reports).toEqual([]);
  });
});

describe("hidden channel switch", () => {
  it("switches to beta", async () => {
    const { liveUpdate, plugin } = setup();

    await liveUpdate.setChannel("beta");

    expect(plugin.setChannel).toHaveBeenCalledWith({ channel: "beta" });
  });

  it("does not turn OTA on for a binary built without it", async () => {
    const { liveUpdate, plugin } = setup({ channel: null });

    await liveUpdate.setChannel("beta");

    expect(plugin.setChannel).not.toHaveBeenCalled();
  });
});
