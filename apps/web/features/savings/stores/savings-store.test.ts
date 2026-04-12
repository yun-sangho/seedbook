import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSavingsStore } from "./savings-store";

// localStorage mock
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.localStorage = localStorageMock as any;

// Date mock for consistent testing
const mockDate = new Date("2024-01-15T10:00:00Z");

describe("Savings Store", () => {
  beforeEach(() => {
    // Reset store before each test
    useSavingsStore.getState().resetStore();
    vi.clearAllMocks();

    // Mock current date
    vi.setSystemTime(mockDate);
  });

  describe("Initial State", () => {
    it("should have correct initial state", () => {
      const state = useSavingsStore.getState();
      expect(state.savings).toEqual([]);
      expect(state.expandedFormId).toBe("");
    });
  });

  describe("Savings Management", () => {
    it("should add savings with type and owner", () => {
      const { addSavingsWithTypeAndOwner } = useSavingsStore.getState();

      addSavingsWithTypeAndOwner("정기예금", "홍길동");

      const state = useSavingsStore.getState();
      expect(state.savings[0]!).toMatchObject({
        accountName: "홍길동의 정기예금 계좌",
        accountType: "정기예금",
        accountOwner: "홍길동",
      });
    });

    it("should remove a savings account", () => {
      const { addSavingsWithTypeAndOwner, removeSavings } = useSavingsStore.getState();

      addSavingsWithTypeAndOwner("정기예금", "홍길동");
      const firstId = useSavingsStore.getState().savings[0]!.id;
      addSavingsWithTypeAndOwner("적금", "김철수");
      // savings are appended, so the second added is at index 1
      const secondId = useSavingsStore.getState().savings[1]!.id;

      let state = useSavingsStore.getState();
      expect(state.savings).toHaveLength(2);

      removeSavings(firstId);

      state = useSavingsStore.getState();
      expect(state.savings).toHaveLength(1);
      expect(state.savings[0]!.id).toBe(secondId);
    });

    it("should reset expandedFormId when removing the expanded account", () => {
      const { addSavingsWithTypeAndOwner, removeSavings } = useSavingsStore.getState();

      addSavingsWithTypeAndOwner("정기예금", "홍길동");
      const id = useSavingsStore.getState().savings[0]!.id;

      let state = useSavingsStore.getState();
      expect(state.expandedFormId).toBe(id);

      removeSavings(id);

      state = useSavingsStore.getState();
      expect(state.expandedFormId).toBe("");
    });
  });

  describe("Savings Updates", () => {
    let savingsId: string;

    beforeEach(() => {
      const { addSavingsWithTypeAndOwner } = useSavingsStore.getState();
      addSavingsWithTypeAndOwner("정기예금", "홍길동");
      savingsId = useSavingsStore.getState().savings[0]!.id;
    });

    it("should update savings field", () => {
      const { updateSavings } = useSavingsStore.getState();

      updateSavings(savingsId, "accountName", "새로운 계좌명");

      const state = useSavingsStore.getState();
      expect(state.savings[0]!.accountName).toBe("새로운 계좌명");
    });

    it("should create record when updating balance", () => {
      const { updateSavings } = useSavingsStore.getState();

      updateSavings(savingsId, "balance", 1000000);

      const state = useSavingsStore.getState();
      const savings = state.savings[0]!;
      expect(savings.balance).toBe(1000000);
      expect(savings.records).toHaveLength(1);
      expect(savings.records[0]!).toMatchObject({
        date: "2024-01-15",
        balance: 1000000,
      });
    });

    it("should replace record if same date exists", () => {
      const { updateSavings } = useSavingsStore.getState();

      // First update
      updateSavings(savingsId, "balance", 1000000);

      // Second update on same day
      updateSavings(savingsId, "balance", 1200000);

      const state = useSavingsStore.getState();
      const savings = state.savings[0]!;
      expect(savings.records).toHaveLength(1);
      expect(savings.records[0]!.balance).toBe(1200000);
    });

    it("should update interest rate", () => {
      const { updateSavings } = useSavingsStore.getState();

      updateSavings(savingsId, "interestRate", 3.5);

      const state = useSavingsStore.getState();
      expect(state.savings[0]!.interestRate).toBe(3.5);
    });
  });

  describe("History Record Management", () => {
    let savingsId: string;

    beforeEach(() => {
      const { addSavingsWithTypeAndOwner } = useSavingsStore.getState();
      addSavingsWithTypeAndOwner("정기예금", "홍길동");
      savingsId = useSavingsStore.getState().savings[0]!.id;
    });

    it("should add history record", () => {
      const { addHistoryRecord } = useSavingsStore.getState();

      addHistoryRecord(savingsId, "2024-01-10", 500000);

      const state = useSavingsStore.getState();
      const savings = state.savings[0]!;
      expect(savings.records).toHaveLength(1);
      expect(savings.records[0]!).toMatchObject({
        date: "2024-01-10",
        balance: 500000,
      });
    });

    it("should replace existing record with same date", () => {
      const { addHistoryRecord } = useSavingsStore.getState();

      // Add first record
      addHistoryRecord(savingsId, "2024-01-10", 500000);

      // Add second record with same date (should replace)
      addHistoryRecord(savingsId, "2024-01-10", 700000);

      const state = useSavingsStore.getState();
      const savings = state.savings[0]!;
      expect(savings.records).toHaveLength(1);
      expect(savings.records[0]!).toMatchObject({
        date: "2024-01-10",
        balance: 700000,
      });
    });

    it("should sort records by date (latest first)", () => {
      const { addHistoryRecord } = useSavingsStore.getState();

      addHistoryRecord(savingsId, "2024-01-10", 500000);
      addHistoryRecord(savingsId, "2024-01-05", 400000);
      addHistoryRecord(savingsId, "2024-01-15", 600000);

      const state = useSavingsStore.getState();
      const dates = state.savings[0]!.records.map((r) => r.date);
      expect(dates).toEqual(["2024-01-15", "2024-01-10", "2024-01-05"]);
    });

    it("should remove history record by date", () => {
      const { addHistoryRecord, removeSavingsHistoryRecord } = useSavingsStore.getState();

      addHistoryRecord(savingsId, "2024-01-10", 500000);
      addHistoryRecord(savingsId, "2024-01-15", 600000);
      addHistoryRecord(savingsId, "2024-01-05", 400000);

      let state = useSavingsStore.getState();
      const savings = state.savings[0]!;
      expect(savings.records).toHaveLength(3);

      // Remove record
      removeSavingsHistoryRecord(savingsId, "2024-01-10");

      state = useSavingsStore.getState();
      expect(state.savings[0]!.records).toHaveLength(2);
      expect(state.savings[0]!.records.map((r) => r.date)).toEqual(["2024-01-15", "2024-01-05"]);
    });

    it("should handle removing non-existent record", () => {
      const { addHistoryRecord, removeSavingsHistoryRecord } = useSavingsStore.getState();

      addHistoryRecord(savingsId, "2024-01-10", 500000);

      removeSavingsHistoryRecord(savingsId, "2024-01-20");

      const state = useSavingsStore.getState();
      expect(state.savings[0]!.records).toHaveLength(1);
    });
  });

  describe("UI State", () => {
    it("should set expanded form id", () => {
      const { setExpandedFormId } = useSavingsStore.getState();

      setExpandedFormId("5");

      const state = useSavingsStore.getState();
      expect(state.expandedFormId).toBe("5");
    });

    it("should set expandedFormId when adding new savings", () => {
      const { addSavingsWithTypeAndOwner } = useSavingsStore.getState();

      addSavingsWithTypeAndOwner("정기예금", "홍길동");

      const state = useSavingsStore.getState();
      expect(state.expandedFormId).toBe(state.savings[0]!.id); // New account ID
    });
  });

  describe("Store Reset", () => {
    it("should reset store to initial state", () => {
      const { addSavingsWithTypeAndOwner, setExpandedFormId, resetStore } =
        useSavingsStore.getState();

      // Add some data
      addSavingsWithTypeAndOwner("정기예금", "홍길동");
      setExpandedFormId("5");

      // Verify data was added
      let state = useSavingsStore.getState();
      expect(state.savings).toHaveLength(1);
      expect(state.expandedFormId).toBe("5");

      // Reset store
      resetStore();

      // Verify reset
      state = useSavingsStore.getState();
      expect(state.savings).toEqual([]);
      expect(state.expandedFormId).toBe("");
    });
  });

  describe("Reorder Savings", () => {
    it("should reorder savings array", () => {
      const { addSavingsWithTypeAndOwner, updateSavings, reorderSavings } =
        useSavingsStore.getState();

      // Add three savings accounts
      addSavingsWithTypeAndOwner("정기예금", "홍길동");
      const idA = useSavingsStore.getState().savings[0]!.id;
      addSavingsWithTypeAndOwner("적금", "김철수");
      const idB = useSavingsStore.getState().savings[1]!.id;
      addSavingsWithTypeAndOwner("정기적금", "박영희");
      const idC = useSavingsStore.getState().savings[2]!.id;

      // Update names to identify them
      updateSavings(idA, "accountName", "First");
      updateSavings(idB, "accountName", "Second");
      updateSavings(idC, "accountName", "Third");

      let state = useSavingsStore.getState();
      // Savings are appended, so order is: [First, Second, Third]
      expect(state.savings.map((s) => s.accountName)).toEqual(["First", "Second", "Third"]);

      // Reorder: move Third to the beginning
      const reordered = [state.savings[2]!, state.savings[0]!, state.savings[1]!];
      reorderSavings(reordered);

      state = useSavingsStore.getState();
      expect(state.savings.map((s) => s.accountName)).toEqual(["Third", "First", "Second"]);
    });

    it("should maintain savings data when reordering", () => {
      const { addSavingsWithTypeAndOwner, addHistoryRecord, reorderSavings } =
        useSavingsStore.getState();

      // Add savings with history
      addSavingsWithTypeAndOwner("정기예금", "홍길동");
      const idA = useSavingsStore.getState().savings[0]!.id;
      addHistoryRecord(idA, "2024-01-10", 500000);

      addSavingsWithTypeAndOwner("적금", "김철수");
      const idB = useSavingsStore.getState().savings[1]!.id;
      addHistoryRecord(idB, "2024-01-12", 1000000);

      let state = useSavingsStore.getState();
      const originalFirst = state.savings[0]!;
      const originalSecond = state.savings[1]!;

      // Reverse order
      reorderSavings([originalSecond, originalFirst]);

      state = useSavingsStore.getState();
      // Verify data integrity
      expect(state.savings[0]!.id).toBe(idB);
      expect(state.savings[0]!.records).toHaveLength(1);
      expect(state.savings[0]!.records[0]!.balance).toBe(1000000);

      expect(state.savings[1]!.id).toBe(idA);
      expect(state.savings[1]!.records).toHaveLength(1);
      expect(state.savings[1]!.records[0]!.balance).toBe(500000);
    });

    it("should handle empty array reorder", () => {
      const { reorderSavings } = useSavingsStore.getState();

      reorderSavings([]);

      const state = useSavingsStore.getState();
      expect(state.savings).toEqual([]);
    });

    it("should handle single item reorder", () => {
      const { addSavingsWithTypeAndOwner, reorderSavings } = useSavingsStore.getState();

      addSavingsWithTypeAndOwner("정기예금", "홍길동");

      let state = useSavingsStore.getState();
      const singleItem = state.savings[0]!;

      reorderSavings([singleItem]);

      state = useSavingsStore.getState();
      expect(state.savings).toHaveLength(1);
      expect(state.savings[0]!.id).toBe(singleItem.id);
    });
  });

  describe("Complex Scenarios", () => {
    it("should handle multiple savings with different histories", () => {
      const { addSavingsWithTypeAndOwner, addHistoryRecord } = useSavingsStore.getState();

      // Add two savings accounts
      addSavingsWithTypeAndOwner("정기예금", "홍길동");
      const idA = useSavingsStore.getState().savings[0]!.id;
      addSavingsWithTypeAndOwner("적금", "김철수");
      const idB = useSavingsStore.getState().savings[1]!.id;

      // Add history to first account
      addHistoryRecord(idA, "2024-01-10", 500000);
      addHistoryRecord(idA, "2024-01-15", 600000);

      // Add history to second account
      addHistoryRecord(idB, "2024-01-12", 1000000);

      const state = useSavingsStore.getState();
      expect(state.savings).toHaveLength(2);
      expect(state.savings[0]!.records).toHaveLength(2); // First account
      expect(state.savings[1]!.records).toHaveLength(1); // Second account
    });

    it("should handle concurrent updates on same savings account", () => {
      const { addSavingsWithTypeAndOwner, updateSavings } = useSavingsStore.getState();

      addSavingsWithTypeAndOwner("정기예금", "홍길동");
      const id = useSavingsStore.getState().savings[0]!.id;

      // Update balance and interest rate
      updateSavings(id, "balance", 500000);
      updateSavings(id, "interestRate", 3.5);

      const state = useSavingsStore.getState();
      const savings = state.savings[0]!;
      expect(savings.balance).toBe(500000);
      expect(savings.interestRate).toBe(3.5);
      // Should have one record for the balance update
      expect(savings.records).toHaveLength(1);
      expect(savings.records[0]!).toMatchObject({
        balance: 500000,
      });
    });

    it("should handle balance updates creating multiple records on different dates", () => {
      const { addSavingsWithTypeAndOwner, updateSavings, addHistoryRecord } =
        useSavingsStore.getState();

      addSavingsWithTypeAndOwner("정기예금", "홍길동");
      const id = useSavingsStore.getState().savings[0]!.id;

      // Add a past record
      addHistoryRecord(id, "2024-01-10", 400000);

      // Update current balance (today's date)
      updateSavings(id, "balance", 500000);

      const state = useSavingsStore.getState();
      const savings = state.savings[0]!;
      expect(savings.records).toHaveLength(2);
      expect(savings.records[0]!.date).toBe("2024-01-15"); // Most recent
      expect(savings.records[1]!.date).toBe("2024-01-10");
    });
  });

  describe("Color Management", () => {
    it("should assign a color when adding a new savings account", () => {
      const { addSavingsWithTypeAndOwner } = useSavingsStore.getState();

      addSavingsWithTypeAndOwner("정기예금", "홍길동");

      const state = useSavingsStore.getState();
      expect(state.savings[0]!.color).toBeDefined();
      expect(typeof state.savings[0]!.color).toBe("string");
      expect(state.savings[0]!.color).toMatch(/^#[0-9a-f]{6}$/i);
    });

    it("should assign different colors to multiple savings accounts", () => {
      const { addSavingsWithTypeAndOwner } = useSavingsStore.getState();

      addSavingsWithTypeAndOwner("정기예금", "홍길동");
      addSavingsWithTypeAndOwner("적금", "김철수");
      addSavingsWithTypeAndOwner("정기적금", "박영희");

      const state = useSavingsStore.getState();
      const colors = state.savings.map((s) => s.color);

      // First 3 savings should have different colors
      expect(colors[0]).not.toBe(colors[1]);
      expect(colors[1]).not.toBe(colors[2]);
      expect(colors[0]).not.toBe(colors[2]);
    });

    it("should update savings color", () => {
      const { addSavingsWithTypeAndOwner, updateSavings } = useSavingsStore.getState();

      addSavingsWithTypeAndOwner("정기예금", "홍길동");
      const id = useSavingsStore.getState().savings[0]!.id;
      const initialColor = useSavingsStore.getState().savings[0]!.color;

      updateSavings(id, "color", "#ff0000");

      const state = useSavingsStore.getState();
      expect(state.savings[0]!.color).toBe("#ff0000");
      expect(state.savings[0]!.color).not.toBe(initialColor);
    });
  });

  describe("Edge Cases", () => {
    it("should handle non-existent savings ID in update", () => {
      const { addSavingsWithTypeAndOwner, updateSavings } = useSavingsStore.getState();

      addSavingsWithTypeAndOwner("정기예금", "홍길동");

      // Try to update non-existent ID
      updateSavings("nonexistent-id", "accountName", "Should not work");

      const state = useSavingsStore.getState();
      expect(state.savings[0]!.accountName).toBe("홍길동의 정기예금 계좌");
    });

    it("should handle non-existent savings ID in history record", () => {
      const { addSavingsWithTypeAndOwner, addHistoryRecord } = useSavingsStore.getState();

      addSavingsWithTypeAndOwner("정기예금", "홍길동");

      // Try to add history to non-existent ID
      addHistoryRecord("nonexistent-id", "2024-01-10", 500000);

      const state = useSavingsStore.getState();
      expect(state.savings[0]!.records).toHaveLength(0);
    });

    it("should handle empty records array", () => {
      const { addSavingsWithTypeAndOwner } = useSavingsStore.getState();

      addSavingsWithTypeAndOwner("정기예금", "홍길동");

      const state = useSavingsStore.getState();
      expect(state.savings[0]!.records).toEqual([]);
    });

    it("should maintain records integrity after multiple operations", () => {
      const { addSavingsWithTypeAndOwner, updateSavings, addHistoryRecord } =
        useSavingsStore.getState();

      addSavingsWithTypeAndOwner("정기예금", "홍길동");
      const id = useSavingsStore.getState().savings[0]!.id;

      // Add past records
      addHistoryRecord(id, "2024-01-01", 100000);
      addHistoryRecord(id, "2024-01-05", 200000);

      // Update current balance
      updateSavings(id, "balance", 300000);

      // Add another past record
      addHistoryRecord(id, "2024-01-10", 250000);

      const state = useSavingsStore.getState();
      const dates = state.savings[0]!.records.map((r) => r.date);
      // Should be sorted by date (latest first)
      expect(dates).toEqual(["2024-01-15", "2024-01-10", "2024-01-05", "2024-01-01"]);
    });
  });
});
