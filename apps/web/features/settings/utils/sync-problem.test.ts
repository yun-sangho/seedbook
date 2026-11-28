import type { SyncStatus } from "@web/lib/sync/v2/engine";
import { describe, expect, it } from "vitest";
import { describeSyncStop, syncProblem } from "./sync-problem";

const NOW = new Date("2026-11-28T00:00:00.000Z");
const status = (overrides: Partial<SyncStatus> = {}): SyncStatus => ({
  lastSuccessAt: "2026-11-27T00:00:00.000Z",
  startedAt: "2026-11-01T00:00:00.000Z",
  stoppedReason: null,
  hasQuarantine: false,
  ...overrides,
});

describe("syncProblem", () => {
  it("shows nothing while syncs keep succeeding", () => {
    expect(syncProblem(status(), "cloud", NOW)).toBeNull();
  });

  it("shows nothing in local mode", () => {
    expect(syncProblem(status({ stoppedReason: "update_required" }), "local", NOW)).toBeNull();
  });

  it("tells the user when the last success is more than three days old", () => {
    const old = status({ lastSuccessAt: "2026-11-24T23:00:00.000Z" });
    expect(syncProblem(old, "cloud", NOW)).toBe("stale");
  });

  it("counts from the start when it never succeeded", () => {
    const never = status({ lastSuccessAt: null, startedAt: "2026-11-27T00:00:00.000Z" });
    expect(syncProblem(never, "cloud", NOW)).toBeNull();
  });

  it("tells the user right away when an update is needed", () => {
    expect(syncProblem(status({ stoppedReason: "update_required" }), "cloud", NOW)).toBe(
      "update_required"
    );
  });

  it("does not show a server running behind the app until three days pass", () => {
    expect(syncProblem(status({ stoppedReason: "server_behind" }), "cloud", NOW)).toBeNull();
  });

  it("tells the user right away about quarantined changes", () => {
    expect(syncProblem(status({ hasQuarantine: true }), "cloud", NOW)).toBe("quarantine");
  });
});

describe("describeSyncStop", () => {
  it("says nothing for a healthy sync", () => {
    expect(describeSyncStop(status())).toBeNull();
  });

  it("explains a stop for an app update", () => {
    expect(describeSyncStop(status({ stoppedReason: "update_required" }))).toContain("업데이트");
  });
});
