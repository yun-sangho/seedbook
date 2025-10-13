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
    it("should have correct initial state with default real asset", () => {
      const state = useRealAssetsStore.getState();
      expect(state.realAssets).toHaveLength(1);
      expect(state.realAssets[0]).toMatchObject({
        id: 1,
        assetName: "실물자산 #1",
        assetType: "부동산",
        assetOwner: "본인",
        currentValue: 0,
        purchaseValue: 0,
        purchaseDate: "",
        note: "",
      });
      expect(state.realAssets[0]!.color).toBeDefined();
      expect(state.lastRealAssetId).toBe(1);
      expect(state.expandedFormId).toBe(1);
    });
  });

  describe("Real Asset Management", () => {
    it("should add a new real asset", () => {
      const { addRealAsset } = useRealAssetsStore.getState();

      addRealAsset();

      const state = useRealAssetsStore.getState();
      expect(state.realAssets).toHaveLength(2);
      expect(state.realAssets[0]).toMatchObject({
        id: 2,
        assetName: "실물자산 #2",
        assetType: "부동산",
        assetOwner: "본인",
      });
      expect(state.lastRealAssetId).toBe(2);
      expect(state.expandedFormId).toBe(2);
    });

    it("should add multiple real assets with incrementing IDs", () => {
      const { addRealAsset } = useRealAssetsStore.getState();

      addRealAsset();
      addRealAsset();
      addRealAsset();

      const state = useRealAssetsStore.getState();
      expect(state.realAssets).toHaveLength(4); // 1 default + 3 added
      expect(state.realAssets.map((a) => a.id)).toEqual([4, 3, 2, 1]); // Prepended order
      expect(state.lastRealAssetId).toBe(4);
    });

    it("should remove a real asset", () => {
      const { addRealAsset, removeRealAsset } = useRealAssetsStore.getState();

      addRealAsset();
      addRealAsset();

      let state = useRealAssetsStore.getState();
      expect(state.realAssets).toHaveLength(3);

      removeRealAsset(2);

      state = useRealAssetsStore.getState();
      expect(state.realAssets).toHaveLength(2);
      expect(state.realAssets.find((a) => a.id === 2)).toBeUndefined();
    });

    it("should remove all assets except default when removing default", () => {
      const { removeRealAsset } = useRealAssetsStore.getState();

      removeRealAsset(1);

      const state = useRealAssetsStore.getState();
      expect(state.realAssets).toHaveLength(0);
    });
  });

  describe("Real Asset Updates", () => {
    it("should update asset name", () => {
      const { updateRealAsset } = useRealAssetsStore.getState();

      updateRealAsset(1, "assetName", "우리집");

      const state = useRealAssetsStore.getState();
      expect(state.realAssets[0]!.assetName).toBe("우리집");
    });

    it("should update asset type", () => {
      const { updateRealAsset } = useRealAssetsStore.getState();

      updateRealAsset(1, "assetType", "자동차");

      const state = useRealAssetsStore.getState();
      expect(state.realAssets[0]!.assetType).toBe("자동차");
    });

    it("should update asset owner", () => {
      const { updateRealAsset } = useRealAssetsStore.getState();

      updateRealAsset(1, "assetOwner", "배우자");

      const state = useRealAssetsStore.getState();
      expect(state.realAssets[0]!.assetOwner).toBe("배우자");
    });

    it("should update current value with string input", () => {
      const { updateRealAsset } = useRealAssetsStore.getState();

      updateRealAsset(1, "currentValue", "50000");

      const state = useRealAssetsStore.getState();
      expect(state.realAssets[0]!.currentValue).toBe(50000);
    });

    it("should update current value with number input", () => {
      const { updateRealAsset } = useRealAssetsStore.getState();

      updateRealAsset(1, "currentValue", 50000);

      const state = useRealAssetsStore.getState();
      expect(state.realAssets[0]!.currentValue).toBe(50000);
    });

    it("should update purchase value with string input", () => {
      const { updateRealAsset } = useRealAssetsStore.getState();

      updateRealAsset(1, "purchaseValue", "30000");

      const state = useRealAssetsStore.getState();
      expect(state.realAssets[0]!.purchaseValue).toBe(30000);
    });

    it("should update purchase date", () => {
      const { updateRealAsset } = useRealAssetsStore.getState();

      updateRealAsset(1, "purchaseDate", "2024-01-15");

      const state = useRealAssetsStore.getState();
      expect(state.realAssets[0]!.purchaseDate).toBe("2024-01-15");
    });

    it("should update note", () => {
      const { updateRealAsset } = useRealAssetsStore.getState();

      updateRealAsset(1, "note", "강남구 아파트");

      const state = useRealAssetsStore.getState();
      expect(state.realAssets[0]!.note).toBe("강남구 아파트");
    });

    it("should handle empty string for numeric fields", () => {
      const { updateRealAsset } = useRealAssetsStore.getState();

      updateRealAsset(1, "currentValue", "");

      const state = useRealAssetsStore.getState();
      expect(state.realAssets[0]!.currentValue).toBe(0);
    });

    it("should update expandedFormId when updating different asset", () => {
      const { addRealAsset, updateRealAsset } = useRealAssetsStore.getState();

      addRealAsset(); // id: 2

      let state = useRealAssetsStore.getState();
      expect(state.expandedFormId).toBe(2);

      // Update asset 1 - should change expandedFormId to 1
      updateRealAsset(1, "assetName", "Updated");

      state = useRealAssetsStore.getState();
      expect(state.expandedFormId).toBe(1);
    });

    it("should not change expandedFormId when updating currently expanded asset", () => {
      const { addRealAsset, setExpandedFormId, updateRealAsset } = useRealAssetsStore.getState();

      addRealAsset(); // id: 2
      setExpandedFormId(2);

      // Update the currently expanded asset
      updateRealAsset(2, "assetName", "Updated");

      const state = useRealAssetsStore.getState();
      expect(state.expandedFormId).toBe(2); // Should remain the same
    });
  });

  describe("UI State", () => {
    it("should set expanded form id", () => {
      const { setExpandedFormId } = useRealAssetsStore.getState();

      setExpandedFormId(5);

      const state = useRealAssetsStore.getState();
      expect(state.expandedFormId).toBe(5);
    });

    it("should update expandedFormId when adding new asset", () => {
      const { addRealAsset } = useRealAssetsStore.getState();

      addRealAsset();

      const state = useRealAssetsStore.getState();
      expect(state.expandedFormId).toBe(2); // ID of newly added asset
    });
  });

  describe("Store Reset", () => {
    it("should reset store to initial state with default asset", () => {
      const { addRealAsset, setExpandedFormId, resetStore } = useRealAssetsStore.getState();

      // Add some data
      addRealAsset();
      setExpandedFormId(5);

      // Verify data was added
      let state = useRealAssetsStore.getState();
      expect(state.realAssets).toHaveLength(2);
      expect(state.expandedFormId).toBe(5);

      // Reset store
      resetStore();

      // Verify reset
      state = useRealAssetsStore.getState();
      expect(state.realAssets).toHaveLength(1);
      expect(state.realAssets[0]).toMatchObject({
        id: 1,
        assetName: "실물자산 #1",
      });
      expect(state.lastRealAssetId).toBe(1);
      expect(state.expandedFormId).toBe(1);
    });
  });

  describe("Reorder Real Assets", () => {
    it("should reorder real assets array", () => {
      const { addRealAsset, updateRealAsset, reorderRealAssets } = useRealAssetsStore.getState();

      // Add two more assets (total 3 with default)
      addRealAsset(); // id: 2
      addRealAsset(); // id: 3

      // Update names to identify them
      updateRealAsset(1, "assetName", "First");
      updateRealAsset(2, "assetName", "Second");
      updateRealAsset(3, "assetName", "Third");

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

      // Update default asset
      updateRealAsset(1, "assetName", "우리집");
      updateRealAsset(1, "currentValue", 50000);

      // Add another asset
      addRealAsset(); // id: 2
      updateRealAsset(2, "assetName", "자동차");
      updateRealAsset(2, "currentValue", 3000);

      let state = useRealAssetsStore.getState();
      const originalFirst = state.realAssets[0]!;
      const originalSecond = state.realAssets[1]!;

      // Reverse order
      reorderRealAssets([originalSecond, originalFirst]);

      state = useRealAssetsStore.getState();
      // Verify data integrity
      expect(state.realAssets[0]!.id).toBe(1);
      expect(state.realAssets[0]!.assetName).toBe("우리집");
      expect(state.realAssets[0]!.currentValue).toBe(50000);

      expect(state.realAssets[1]!.id).toBe(2);
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
      const { reorderRealAssets } = useRealAssetsStore.getState();

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

      // Update default asset
      updateRealAsset(1, "assetName", "아파트");
      updateRealAsset(1, "currentValue", 80000);
      updateRealAsset(1, "purchaseValue", 60000);

      // Add and update second asset
      addRealAsset();
      updateRealAsset(2, "assetName", "자동차");
      updateRealAsset(2, "currentValue", 3000);
      updateRealAsset(2, "purchaseValue", 4000);

      const state = useRealAssetsStore.getState();
      expect(state.realAssets).toHaveLength(2);
      expect(state.realAssets[1]).toMatchObject({
        assetName: "아파트",
        currentValue: 80000,
        purchaseValue: 60000,
      });
      expect(state.realAssets[0]).toMatchObject({
        assetName: "자동차",
        currentValue: 3000,
        purchaseValue: 4000,
      });
    });

    it("should handle concurrent updates on same asset", () => {
      const { updateRealAsset } = useRealAssetsStore.getState();

      // Update multiple fields
      updateRealAsset(1, "assetName", "강남 아파트");
      updateRealAsset(1, "currentValue", 100000);
      updateRealAsset(1, "purchaseValue", 70000);
      updateRealAsset(1, "assetOwner", "공동소유");

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
      addRealAsset();

      // Update different assets
      updateRealAsset(1, "currentValue", 10000);
      updateRealAsset(2, "currentValue", 20000);
      updateRealAsset(3, "currentValue", 30000);

      const state = useRealAssetsStore.getState();
      expect(state.realAssets.find((a) => a.id === 1)!.currentValue).toBe(10000);
      expect(state.realAssets.find((a) => a.id === 2)!.currentValue).toBe(20000);
      expect(state.realAssets.find((a) => a.id === 3)!.currentValue).toBe(30000);
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

      // First 4 assets (including default) should have different colors
      expect(colors[0]).not.toBe(colors[1]);
      expect(colors[1]).not.toBe(colors[2]);
      expect(colors[2]).not.toBe(colors[3]);
      expect(colors[0]).not.toBe(colors[2]);
      expect(colors[0]).not.toBe(colors[3]);
      expect(colors[1]).not.toBe(colors[3]);
    });

    it("should update asset color", () => {
      const { updateRealAsset } = useRealAssetsStore.getState();

      const initialColor = useRealAssetsStore.getState().realAssets[0]!.color;

      updateRealAsset(1, "color", "#ff0000");

      const state = useRealAssetsStore.getState();
      expect(state.realAssets[0]!.color).toBe("#ff0000");
      expect(state.realAssets[0]!.color).not.toBe(initialColor);
    });

    it("should have color in default real asset", () => {
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
    it("should add color to assets without color property during rehydration", () => {
      // Simulate loading old data without color
      const oldData = {
        realAssets: [
          {
            id: 1,
            assetName: "Old Asset",
            assetType: "부동산",
            assetOwner: "본인",
            currentValue: 50000,
            purchaseValue: 40000,
            purchaseDate: "2024-01-01",
            note: "Test",
            // No color property
          },
        ],
        customOwners: [],
        lastRealAssetId: 1,
      };

      // Mock the rehydration
      localStorageMock.getItem.mockReturnValue(JSON.stringify({ state: oldData }));

      // Reset and let it rehydrate
      useRealAssetsStore.persist.rehydrate();

      const state = useRealAssetsStore.getState();
      expect(state.realAssets[0]!.color).toBeDefined();
      expect(typeof state.realAssets[0]!.color).toBe("string");
    });
  });
});
