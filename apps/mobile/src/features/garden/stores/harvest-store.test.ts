import { beforeEach, describe, expect, it, vi } from "vitest";
import { useHarvestStore } from "./harvest-store";

vi.stubGlobal("localStorage", {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
});

const HARVEST = {
  id: "9b2f0a4e-1c3d-5e6f-8a7b-9c0d1e2f3a4b",
  sourceType: "portfolio" as const,
  sourceId: "6a1f8c2e-3b4d-4e5f-8a9b-0c1d2e3f4a5b",
  sourceName: "안정형",
  season: 1,
  plantKind: "tree" as const,
  wish: "제주 여행",
  plantName: "",
  wishHistory: [],
  goals: [{ amount: 1_000_000, reachedAt: "2026-11-01T00:00:00.000Z" }],
  harvestedAt: "2026-11-28T06:30:00.000Z",
  doneAt: null,
};

describe("useHarvestStore", () => {
  beforeEach(() => {
    useHarvestStore.setState({ harvests: [] });
  });

  it("puts the newest harvest first", () => {
    useHarvestStore.getState().addHarvest(HARVEST);
    useHarvestStore.getState().addHarvest({ ...HARVEST, id: "other", season: 2 });

    expect(useHarvestStore.getState().harvests.map((h) => h.season)).toEqual([2, 1]);
  });

  it("keeps one harvest for the same portfolio and season", () => {
    useHarvestStore.getState().addHarvest(HARVEST);
    useHarvestStore.getState().addHarvest({ ...HARVEST, harvestedAt: "2026-11-29T00:00:00.000Z" });

    expect(useHarvestStore.getState().harvests).toEqual([HARVEST]);
  });

  it("marks the wish done and undoes it", () => {
    useHarvestStore.getState().addHarvest(HARVEST);

    useHarvestStore.getState().toggleHarvestDone(HARVEST.id, "2026-12-01T00:00:00.000Z");
    expect(useHarvestStore.getState().harvests[0]!.doneAt).toBe("2026-12-01T00:00:00.000Z");

    useHarvestStore.getState().toggleHarvestDone(HARVEST.id);
    expect(useHarvestStore.getState().harvests[0]!.doneAt).toBeNull();
  });
});
