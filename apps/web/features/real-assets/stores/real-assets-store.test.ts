import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRealAssetsStore } from "./real-assets-store";

// localStorage mock
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.localStorage = localStorageMock as any;

describe("Real Assets Store", () => {
  beforeEach(() => {
    // Reset store before each test
    useRealAssetsStore.getState().resetStore();
    vi.clearAllMocks();
  });

  describe("Initial State", () => {
    it("should have correct initial state with empty real assets", () => {
      const state = useRealAssetsStore.getState();
      expect(state.realAssets).toHaveLength(0);
      expect(state.expandedFormId).toBe("");
    });
  });

  describe("Real Asset Management", () => {
    it("should add a new real asset", () => {
      const { addRealAsset } = useRealAssetsStore.getState();

      addRealAsset();

      const state = useRealAssetsStore.getState();
      expect(state.realAssets).toHaveLength(1);
      expect(state.realAssets[0]).toMatchObject({
        assetName: "실물자산 #1",
        assetType: "부동산",
        assetOwner: "본인",
      });
      const id = state.realAssets[0]!.id;
      expect(typeof id).toBe("string");
      expect(state.expandedFormId).toBe(id);
    });

    it("should add multiple real assets with unique string IDs", () => {
      const { addRealAsset } = useRealAssetsStore.getState();

      addRealAsset();
      addRealAsset();
      addRealAsset();

      const state = useRealAssetsStore.getState();
      expect(state.realAssets).toHaveLength(3);
      const ids = state.realAssets.map((a) => a.id);
      expect(new Set(ids).size).toBe(3);
      ids.forEach((id) => expect(typeof id).toBe("string"));
    });

    it("should remove a real asset", () => {
      const { addRealAsset, removeRealAsset } = useRealAssetsStore.getState();

      addRealAsset();
      const firstId = useRealAssetsStore.getState().realAssets[0]!.id;
      addRealAsset();

      let state = useRealAssetsStore.getState();
      expect(state.realAssets).toHaveLength(2);

      removeRealAsset(firstId);

      state = useRealAssetsStore.getState();
      expect(state.realAssets).toHaveLength(1);
      expect(state.realAssets.find((a) => a.id === firstId)).toBeUndefined();
    });

    it("should remove asset by id", () => {
      const { addRealAsset, removeRealAsset } = useRealAssetsStore.getState();

      addRealAsset();
      const id = useRealAssetsStore.getState().realAssets[0]!.id;

      removeRealAsset(id);

      const state = useRealAssetsStore.getState();
      expect(state.realAssets).toHaveLength(0);
    });
  });

  describe("Real Asset Updates", () => {
    it("should update asset name", () => {
      const { addRealAsset, updateRealAsset } = useRealAssetsStore.getState();

      addRealAsset();
      const id = useRealAssetsStore.getState().realAssets[0]!.id;

      updateRealAsset(id, "assetName", "우리집");

      const state = useRealAssetsStore.getState();
      expect(state.realAssets[0]!.assetName).toBe("우리집");
    });

    it("should update asset type", () => {
      const { addRealAsset, updateRealAsset } = useRealAssetsStore.getState();

      addRealAsset();
      const id = useRealAssetsStore.getState().realAssets[0]!.id;

      updateRealAsset(id, "assetType", "자동차");

      const state = useRealAssetsStore.getState();
      expect(state.realAssets[0]!.assetType).toBe("자동차");
    });

    it("should update asset owner", () => {
      const { addRealAsset, updateRealAsset } = useRealAssetsStore.getState();

      addRealAsset();
      const id = useRealAssetsStore.getState().realAssets[0]!.id;

      updateRealAsset(id, "assetOwner", "배우자");

      const state = useRealAssetsStore.getState();
      expect(state.realAssets[0]!.assetOwner).toBe("배우자");
    });

    it("should update current value with string input", () => {
      const { addRealAsset, updateRealAsset } = useRealAssetsStore.getState();

      addRealAsset();
      const id = useRealAssetsStore.getState().realAssets[0]!.id;

      updateRealAsset(id, "currentValue", "50000");

      const state = useRealAssetsStore.getState();
      expect(state.realAssets[0]!.currentValue).toBe(50000);
    });

    it("should update current value with number input", () => {
      const { addRealAsset, updateRealAsset } = useRealAssetsStore.getState();

      addRealAsset();
      const id = useRealAssetsStore.getState().realAssets[0]!.id;

      updateRealAsset(id, "currentValue", 50000);

      const state = useRealAssetsStore.getState();
      expect(state.realAssets[0]!.currentValue).toBe(50000);
    });

    it("should update purchase value with string input", () => {
      const { addRealAsset, updateRealAsset } = useRealAssetsStore.getState();

      addRealAsset();
      const id = useRealAssetsStore.getState().realAssets[0]!.id;

      updateRealAsset(id, "purchaseValue", "30000");

      const state = useRealAssetsStore.getState();
      expect(state.realAssets[0]!.purchaseValue).toBe(30000);
    });

    it("should update purchase date", () => {
      const { addRealAsset, updateRealAsset } = useRealAssetsStore.getState();

      addRealAsset();
      const id = useRealAssetsStore.getState().realAssets[0]!.id;

      updateRealAsset(id, "purchaseDate", "2024-01-15");

      const state = useRealAssetsStore.getState();
      expect(state.realAssets[0]!.purchaseDate).toBe("2024-01-15");
    });

    it("should update note", () => {
      const { addRealAsset, updateRealAsset } = useRealAssetsStore.getState();

      addRealAsset();
      const id = useRealAssetsStore.getState().realAssets[0]!.id;

      updateRealAsset(id, "note", "강남구 아파트");

      const state = useRealAssetsStore.getState();
      expect(state.realAssets[0]!.note).toBe("강남구 아파트");
    });

    it("should handle empty string for numeric fields", () => {
      const { addRealAsset, updateRealAsset } = useRealAssetsStore.getState();

      addRealAsset();
      const id = useRealAssetsStore.getState().realAssets[0]!.id;

      updateRealAsset(id, "currentValue", "");

      const state = useRealAssetsStore.getState();
      expect(state.realAssets[0]!.currentValue).toBe(0);
    });

    it("should update expandedFormId when updating different asset", () => {
      const { addRealAsset, updateRealAsset } = useRealAssetsStore.getState();

      addRealAsset();
      const firstId = useRealAssetsStore.getState().realAssets[0]!.id;
      addRealAsset();
      const secondId = useRealAssetsStore.getState().realAssets[0]!.id;

      let state = useRealAssetsStore.getState();
      expect(state.expandedFormId).toBe(secondId);

      // Update the other asset - should change expandedFormId to it
      updateRealAsset(firstId, "assetName", "Updated");

      state = useRealAssetsStore.getState();
      expect(state.expandedFormId).toBe(firstId);
    });

    it("should not change expandedFormId when updating currently expanded asset", () => {
      const { addRealAsset, setExpandedFormId, updateRealAsset } = useRealAssetsStore.getState();

      addRealAsset();
      const firstId = useRealAssetsStore.getState().realAssets[0]!.id;
      addRealAsset();
      const secondId = useRealAssetsStore.getState().realAssets[0]!.id;
      setExpandedFormId(secondId);

      // Update the currently expanded asset
      updateRealAsset(secondId, "assetName", "Updated");

      const state = useRealAssetsStore.getState();
      expect(state.expandedFormId).toBe(secondId); // Should remain the same
      expect(firstId).not.toBe(secondId);
    });
  });

  describe("UI State", () => {
    it("should set expanded form id", () => {
      const { setExpandedFormId } = useRealAssetsStore.getState();

      setExpandedFormId("5");

      const state = useRealAssetsStore.getState();
      expect(state.expandedFormId).toBe("5");
    });

    it("should update expandedFormId when adding new asset", () => {
      const { addRealAsset } = useRealAssetsStore.getState();

      addRealAsset();

      const state = useRealAssetsStore.getState();
      expect(state.expandedFormId).toBe(state.realAssets[0]!.id); // ID of newly added asset
    });
  });

  describe("Store Reset", () => {
    it("should reset store to initial state with empty assets", () => {
      const { addRealAsset, setExpandedFormId, resetStore } = useRealAssetsStore.getState();

      // Add some data
      addRealAsset();
      setExpandedFormId("5");

      // Verify data was added
      let state = useRealAssetsStore.getState();
      expect(state.realAssets).toHaveLength(1);
      expect(state.expandedFormId).toBe("5");

      // Reset store
      resetStore();

      // Verify reset
      state = useRealAssetsStore.getState();
      expect(state.realAssets).toHaveLength(0);
      expect(state.expandedFormId).toBe("");
    });
  });

  describe("Reorder Real Assets", () => {
    it("should reorder real assets array", () => {
      const { addRealAsset, updateRealAsset, reorderRealAssets } = useRealAssetsStore.getState();

      addRealAsset();
      const idA = useRealAssetsStore.getState().realAssets[0]!.id;
      addRealAsset();
      const idB = useRealAssetsStore.getState().realAssets[0]!.id;
      addRealAsset();
      const idC = useRealAssetsStore.getState().realAssets[0]!.id;

      // Update names to identify them
      updateRealAsset(idA, "assetName", "First");
      updateRealAsset(idB, "assetName", "Second");
      updateRealAsset(idC, "assetName", "Third");

      let state = useRealAssetsStore.getState();
      // Assets are prepended, so order is: [Third, Second, First]
      expect(state.realAssets.map((a) => a.assetName)).toEqual(["Third", "Second", "First"]);

      // Reorder: move First to the beginning
      const reordered = [state.realAssets[2]!, state.realAssets[0]!, state.realAssets[1]!];
      reorderRealAssets(reordered);

      state = useRealAssetsStore.getState();
      expect(state.realAssets.map((a) => a.assetName)).toEqual(["First", "Third", "Second"]);
    });

    it("should maintain asset data when reordering", () => {
      const { addRealAsset, updateRealAsset, reorderRealAssets } = useRealAssetsStore.getState();

      addRealAsset();
      const idA = useRealAssetsStore.getState().realAssets[0]!.id;
      updateRealAsset(idA, "assetName", "우리집");
      updateRealAsset(idA, "currentValue", 50000);

      addRealAsset();
      const idB = useRealAssetsStore.getState().realAssets[0]!.id;
      updateRealAsset(idB, "assetName", "자동차");
      updateRealAsset(idB, "currentValue", 3000);

      let state = useRealAssetsStore.getState();
      const originalFirst = state.realAssets[0]!;
      const originalSecond = state.realAssets[1]!;

      // Reverse order
      reorderRealAssets([originalSecond, originalFirst]);

      state = useRealAssetsStore.getState();
      // Verify data integrity
      expect(state.realAssets[0]!.id).toBe(idA);
      expect(state.realAssets[0]!.assetName).toBe("우리집");
      expect(state.realAssets[0]!.currentValue).toBe(50000);

      expect(state.realAssets[1]!.id).toBe(idB);
      expect(state.realAssets[1]!.assetName).toBe("자동차");
      expect(state.realAssets[1]!.currentValue).toBe(3000);
    });

    it("should handle empty array reorder", () => {
      const { reorderRealAssets } = useRealAssetsStore.getState();

      reorderRealAssets([]);

      const state = useRealAssetsStore.getState();
      expect(state.realAssets).toEqual([]);
    });

    it("should handle single item reorder", () => {
      const { addRealAsset, reorderRealAssets } = useRealAssetsStore.getState();

      addRealAsset();

      let state = useRealAssetsStore.getState();
      const singleItem = state.realAssets[0]!;

      reorderRealAssets([singleItem]);

      state = useRealAssetsStore.getState();
      expect(state.realAssets).toHaveLength(1);
      expect(state.realAssets[0]!.id).toBe(singleItem.id);
    });
  });

  describe("Complex Scenarios", () => {
    it("should handle multiple assets with different values", () => {
      const { addRealAsset, updateRealAsset } = useRealAssetsStore.getState();

      addRealAsset();
      const idA = useRealAssetsStore.getState().realAssets[0]!.id;
      updateRealAsset(idA, "assetName", "아파트");
      updateRealAsset(idA, "currentValue", 80000);
      updateRealAsset(idA, "purchaseValue", 60000);

      addRealAsset();
      const idB = useRealAssetsStore.getState().realAssets[0]!.id;
      updateRealAsset(idB, "assetName", "자동차");
      updateRealAsset(idB, "currentValue", 3000);
      updateRealAsset(idB, "purchaseValue", 4000);

      const state = useRealAssetsStore.getState();
      expect(state.realAssets).toHaveLength(2);
      // Second-added is at index 0 (prepended)
      expect(state.realAssets[0]).toMatchObject({
        assetName: "자동차",
        currentValue: 3000,
        purchaseValue: 4000,
      });
      expect(state.realAssets[1]).toMatchObject({
        assetName: "아파트",
        currentValue: 80000,
        purchaseValue: 60000,
      });
    });

    it("should handle concurrent updates on same asset", () => {
      const { addRealAsset, updateRealAsset } = useRealAssetsStore.getState();

      addRealAsset();
      const id = useRealAssetsStore.getState().realAssets[0]!.id;

      // Update multiple fields
      updateRealAsset(id, "assetName", "강남 아파트");
      updateRealAsset(id, "currentValue", 100000);
      updateRealAsset(id, "purchaseValue", 70000);
      updateRealAsset(id, "assetOwner", "공동소유");

      const state = useRealAssetsStore.getState();
      const asset = state.realAssets[0]!;
      expect(asset.assetName).toBe("강남 아파트");
      expect(asset.currentValue).toBe(100000);
      expect(asset.purchaseValue).toBe(70000);
      expect(asset.assetOwner).toBe("공동소유");
    });

    it("should maintain separate state for different assets", () => {
      const { addRealAsset, updateRealAsset } = useRealAssetsStore.getState();

      addRealAsset();
      const idA = useRealAssetsStore.getState().realAssets[0]!.id;
      addRealAsset();
      const idB = useRealAssetsStore.getState().realAssets[0]!.id;
      addRealAsset();
      const idC = useRealAssetsStore.getState().realAssets[0]!.id;

      // Update different assets
      updateRealAsset(idA, "currentValue", 10000);
      updateRealAsset(idB, "currentValue", 20000);
      updateRealAsset(idC, "currentValue", 30000);

      const state = useRealAssetsStore.getState();
      expect(state.realAssets.find((a) => a.id === idA)!.currentValue).toBe(10000);
      expect(state.realAssets.find((a) => a.id === idB)!.currentValue).toBe(20000);
      expect(state.realAssets.find((a) => a.id === idC)!.currentValue).toBe(30000);
    });
  });

  describe("Color Management", () => {
    it("should assign a color when adding a new real asset", () => {
      const { addRealAsset } = useRealAssetsStore.getState();

      addRealAsset();

      const state = useRealAssetsStore.getState();
      const newAsset = state.realAssets[0]!;
      expect(newAsset.color).toBeDefined();
      expect(typeof newAsset.color).toBe("string");
      expect(newAsset.color).toMatch(/^#[0-9a-f]{6}$/i);
    });

    it("should assign different colors to multiple assets", () => {
      const { addRealAsset } = useRealAssetsStore.getState();

      addRealAsset();
      addRealAsset();
      addRealAsset();

      const state = useRealAssetsStore.getState();
      const colors = state.realAssets.map((asset) => asset.color);

      // 3 assets should have different colors
      expect(colors[0]).not.toBe(colors[1]);
      expect(colors[1]).not.toBe(colors[2]);
      expect(colors[0]).not.toBe(colors[2]);
    });

    it("should update asset color", () => {
      const { addRealAsset, updateRealAsset } = useRealAssetsStore.getState();

      addRealAsset();
      const id = useRealAssetsStore.getState().realAssets[0]!.id;

      const initialColor = useRealAssetsStore.getState().realAssets[0]!.color;

      updateRealAsset(id, "color", "#ff0000");

      const state = useRealAssetsStore.getState();
      expect(state.realAssets[0]!.color).toBe("#ff0000");
      expect(state.realAssets[0]!.color).not.toBe(initialColor);
    });

    it("should have color on added real asset", () => {
      const { addRealAsset } = useRealAssetsStore.getState();

      addRealAsset();

      const state = useRealAssetsStore.getState();
      expect(state.realAssets[0]!.color).toBeDefined();
      expect(typeof state.realAssets[0]!.color).toBe("string");
      expect(state.realAssets[0]!.color).toMatch(/^#[0-9a-f]{6}$/i);
    });

    it("should preserve colors when reordering", () => {
      const { addRealAsset, reorderRealAssets } = useRealAssetsStore.getState();

      addRealAsset();
      addRealAsset();

      let state = useRealAssetsStore.getState();
      const originalColors = state.realAssets.map((a) => ({ id: a.id, color: a.color }));

      // Reverse order
      reorderRealAssets([...state.realAssets].reverse());

      state = useRealAssetsStore.getState();

      // Verify colors are preserved for each asset
      originalColors.forEach(({ id, color }) => {
        const asset = state.realAssets.find((a) => a.id === id);
        expect(asset?.color).toBe(color);
      });
    });
  });

  describe("Data Migration", () => {
    it("should add color to assets without color property during rehydration", async () => {
      // Simulate old data without color by setting state directly
      useRealAssetsStore.setState({
        realAssets: [
          {
            id: "legacy-asset-id",
            assetName: "Old Asset",
            assetType: "부동산",
            assetOwner: "본인",
            currentValue: 50000,
            purchaseValue: 40000,
            purchaseDate: "2024-01-01",
            note: "Test",
            color: "", // empty color simulates missing color
          },
        ],
      });

      // Mock localStorage with persisted data lacking color
      localStorageMock.getItem.mockReturnValue(
        JSON.stringify({
          state: {
            realAssets: [
              {
                id: "legacy-asset-id",
                assetName: "Old Asset",
                assetType: "부동산",
                assetOwner: "본인",
                currentValue: 50000,
                purchaseValue: 40000,
                purchaseDate: "2024-01-01",
                note: "Test",
              },
            ],
            customOwners: [],
          },
          version: 1,
        })
      );

      await useRealAssetsStore.persist.rehydrate();

      const state = useRealAssetsStore.getState();
      // After rehydration, onRehydrateStorage should add color to colorless assets
      expect(state.realAssets[0]).toBeDefined();
      expect(state.realAssets[0]!.color).toBeDefined();
      expect(typeof state.realAssets[0]!.color).toBe("string");
    });
  });
});
