import { beforeEach, describe, expect, it, vi } from "vitest";
import { useInvestmentStore } from "./investment-store";

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

describe("Investment Store", () => {
  beforeEach(() => {
    // Reset store before each test
    useInvestmentStore.getState().resetStore();
    vi.clearAllMocks();

    // Mock current date
    vi.setSystemTime(mockDate);
  });

  describe("Initial State", () => {
    it("should have correct initial state", () => {
      const state = useInvestmentStore.getState();
      expect(state.investments).toEqual([]);
      expect(state.lastInvestmentId).toBe(1);
      expect(state.expandedFormId).toBe(1);
    });
  });

  describe("Investment Management", () => {
    it("should add investment with type and owner", () => {
      const { addInvestmentWithTypeAndOwner } = useInvestmentStore.getState();

      addInvestmentWithTypeAndOwner("증권계좌", "홍길동");

      const state = useInvestmentStore.getState();
      expect(state.investments[0]!).toMatchObject({
        accountName: "홍길동의 증권계좌",
        accountType: "증권계좌",
        accountOwner: "홍길동",
      });
    });

    it("should remove an investment", () => {
      const { addInvestmentWithTypeAndOwner, removeInvestment } = useInvestmentStore.getState();

      addInvestmentWithTypeAndOwner("증권계좌", "홍길동");
      addInvestmentWithTypeAndOwner("예금계좌", "김철수");

      let state = useInvestmentStore.getState();
      expect(state.investments).toHaveLength(2);

      removeInvestment(2);

      state = useInvestmentStore.getState();
      expect(state.investments).toHaveLength(1);
      expect(state.investments[0]!.id).toBe(3);
    });
  });

  describe("Investment Updates", () => {
    beforeEach(() => {
      const { addInvestmentWithTypeAndOwner } = useInvestmentStore.getState();
      addInvestmentWithTypeAndOwner("증권계좌", "홍길동");
    });

    it("should update investment field", () => {
      const { updateInvestment } = useInvestmentStore.getState();

      updateInvestment(2, "accountName", "새로운 계좌명");

      const state = useInvestmentStore.getState();
      expect(state.investments[0]!.accountName).toBe("새로운 계좌명");
    });

    it("should create record when updating currentValue", () => {
      const { updateInvestment } = useInvestmentStore.getState();

      updateInvestment(2, "currentValue", "1000000");

      const state = useInvestmentStore.getState();
      const investment = state.investments[0]!;
      expect(investment.currentValue).toBe(1000000);
      expect(investment.records).toHaveLength(1);
      expect(investment.records[0]!).toMatchObject({
        date: "2024-01-15",
        initialInvestment: 0,
        currentValue: 1000000,
      });
    });

    it("should create record when updating initialInvestment", () => {
      const { updateInvestment } = useInvestmentStore.getState();

      updateInvestment(2, "initialInvestment", "500000");

      const state = useInvestmentStore.getState();
      const investment = state.investments[0]!;
      expect(investment.initialInvestment).toBe(500000);
      expect(investment.records).toHaveLength(1);
      expect(investment.records[0]!).toMatchObject({
        date: "2024-01-15",
        initialInvestment: 500000,
        currentValue: 0,
      });
    });

    it("should replace record if same date exists", () => {
      const { updateInvestment } = useInvestmentStore.getState();

      // First update
      updateInvestment(2, "currentValue", "1000000");

      // Second update on same day
      updateInvestment(2, "currentValue", "1200000");

      const state = useInvestmentStore.getState();
      const investment = state.investments[0]!;
      expect(investment.records).toHaveLength(1);
      expect(investment.records[0]!.currentValue).toBe(1200000);
    });
  });

  describe("History Record Management", () => {
    beforeEach(() => {
      const { addInvestmentWithTypeAndOwner } = useInvestmentStore.getState();
      addInvestmentWithTypeAndOwner("증권계좌", "홍길동");
    });

    it("should add history record", () => {
      const { addHistoryRecord } = useInvestmentStore.getState();

      addHistoryRecord(2, "2024-01-10", 500000, 600000);

      const state = useInvestmentStore.getState();
      const investment = state.investments[0]!;
      expect(investment.records).toHaveLength(1);
      expect(investment.records[0]!).toMatchObject({
        date: "2024-01-10",
        initialInvestment: 500000,
        currentValue: 600000,
      });
    });

    it("should replace existing record with same date", () => {
      const { addHistoryRecord } = useInvestmentStore.getState();

      // Add first record
      addHistoryRecord(2, "2024-01-10", 500000, 600000);

      // Add second record with same date (should replace)
      addHistoryRecord(2, "2024-01-10", 700000, 800000);

      const state = useInvestmentStore.getState();
      const investment = state.investments[0]!;
      expect(investment.records).toHaveLength(1);
      expect(investment.records[0]!).toMatchObject({
        date: "2024-01-10",
        initialInvestment: 700000,
        currentValue: 800000,
      });
    });

    it("should sort records by date (latest first)", () => {
      const { addHistoryRecord } = useInvestmentStore.getState();

      addHistoryRecord(2, "2024-01-10", 500000, 600000);
      addHistoryRecord(2, "2024-01-05", 400000, 450000);
      addHistoryRecord(2, "2024-01-15", 600000, 700000);

      const state = useInvestmentStore.getState();
      const dates = state.investments[0]!.records.map((r) => r.date);
      expect(dates).toEqual(["2024-01-15", "2024-01-10", "2024-01-05"]);
    });

    it("should add investment record with defaults", () => {
      const { addInvestmentRecord } = useInvestmentStore.getState();

      addInvestmentRecord(2);

      const state = useInvestmentStore.getState();
      const investment = state.investments[0]!;
      expect(investment.records).toHaveLength(1);
      expect(investment.records[0]!).toMatchObject({
        date: "2024-01-15",
        initialInvestment: 0,
        currentValue: 0,
      });
    });

    it("should add investment record using last record's initialInvestment as default", () => {
      const { addHistoryRecord, addInvestmentRecord } = useInvestmentStore.getState();

      // Add existing record with initialInvestment
      addHistoryRecord(2, "2024-01-10", 500000, 600000);

      // Add new record without specifying initialInvestment
      addInvestmentRecord(2, { currentValue: 700000 });

      const state = useInvestmentStore.getState();
      const investment = state.investments[0]!;
      expect(investment.records).toHaveLength(2);

      // New record should inherit initialInvestment from last record
      const newRecord = investment.records[0]!; // Newest record is first
      expect(newRecord).toMatchObject({
        date: "2024-01-15",
        initialInvestment: 500000, // Inherited from last record
        currentValue: 700000,
      });
    });

    it("should add investment record with custom values", () => {
      const { addInvestmentRecord } = useInvestmentStore.getState();

      addInvestmentRecord(2, {
        initialInvestment: 1000000,
        currentValue: 1200000,
      });

      const state = useInvestmentStore.getState();
      const investment = state.investments[0]!;
      expect(investment.records[0]!).toMatchObject({
        date: "2024-01-15",
        initialInvestment: 1000000,
        currentValue: 1200000,
      });
    });

    it("should update investment record", () => {
      const { addInvestmentRecord, updateInvestmentRecord } = useInvestmentStore.getState();

      addInvestmentRecord(2);
      updateInvestmentRecord(2, 0, "currentValue", "1500000");

      const state = useInvestmentStore.getState();
      const investment = state.investments[0]!;
      expect(investment.records[0]!.currentValue).toBe(1500000);
    });

    it("should remove investment record but keep at least one", () => {
      const { addInvestmentRecord, removeInvestmentRecord } = useInvestmentStore.getState();

      addInvestmentRecord(2);
      addInvestmentRecord(2);

      let state = useInvestmentStore.getState();
      const investment = state.investments[0]!;
      expect(investment.records).toHaveLength(2);

      removeInvestmentRecord(2, 0);

      state = useInvestmentStore.getState();
      expect(state.investments[0]!.records).toHaveLength(1);

      // Try to remove the last record - should not be removed
      removeInvestmentRecord(2, 0);

      state = useInvestmentStore.getState();
      expect(state.investments[0]!.records).toHaveLength(1);
    });

    it("should remove history record by date (except latest)", () => {
      const { addHistoryRecord, removeInvestmentHistoryRecord } = useInvestmentStore.getState();

      addHistoryRecord(2, "2024-01-10", 500000, 600000);
      addHistoryRecord(2, "2024-01-15", 600000, 700000);
      addHistoryRecord(2, "2024-01-05", 400000, 450000);

      let state = useInvestmentStore.getState();
      const investment = state.investments[0]!;
      expect(investment.records).toHaveLength(3);

      // Try to remove latest record (should not be removed)
      removeInvestmentHistoryRecord(2, "2024-01-15");

      state = useInvestmentStore.getState();
      expect(state.investments[0]!.records).toHaveLength(3);

      // Remove non-latest record (should be removed)
      removeInvestmentHistoryRecord(2, "2024-01-10");

      state = useInvestmentStore.getState();
      expect(state.investments[0]!.records).toHaveLength(2);
      expect(state.investments[0]!.records.map((r) => r.date)).toEqual([
        "2024-01-15",
        "2024-01-05",
      ]);
    });
  });

  describe("UI State", () => {
    it("should set expanded form id", () => {
      const { setExpandedFormId } = useInvestmentStore.getState();

      setExpandedFormId(5);

      const state = useInvestmentStore.getState();
      expect(state.expandedFormId).toBe(5);
    });

    it("should update expandedFormId when updating different investment", () => {
      const { addInvestmentWithTypeAndOwner, updateInvestment } = useInvestmentStore.getState();

      addInvestmentWithTypeAndOwner("증권계좌", "홍길동"); // id: 2
      addInvestmentWithTypeAndOwner("예금계좌", "김철수"); // id: 3

      // Initially expanded form is 3 (last added)
      let state = useInvestmentStore.getState();
      expect(state.expandedFormId).toBe(3);

      // Update investment 2 - should change expandedFormId to 2
      updateInvestment(2, "accountName", "Updated");

      state = useInvestmentStore.getState();
      expect(state.expandedFormId).toBe(2);
    });

    it("should not change expandedFormId when updating currently expanded investment", () => {
      const { addInvestmentWithTypeAndOwner, setExpandedFormId, updateInvestment } =
        useInvestmentStore.getState();

      addInvestmentWithTypeAndOwner("증권계좌", "홍길동"); // id: 2
      setExpandedFormId(2);

      // Update the currently expanded investment
      updateInvestment(2, "accountName", "Updated");

      const state = useInvestmentStore.getState();
      expect(state.expandedFormId).toBe(2); // Should remain the same
    });
  });

  describe("Store Reset", () => {
    it("should reset store to initial state", () => {
      const { addInvestmentWithTypeAndOwner, setExpandedFormId, resetStore } =
        useInvestmentStore.getState();

      // Add some data
      addInvestmentWithTypeAndOwner("증권계좌", "홍길동");
      setExpandedFormId(5);

      // Verify data was added
      let state = useInvestmentStore.getState();
      expect(state.investments).toHaveLength(1);
      expect(state.expandedFormId).toBe(5);

      // Reset store
      resetStore();

      // Verify reset
      state = useInvestmentStore.getState();
      expect(state.investments).toEqual([]);
      expect(state.lastInvestmentId).toBe(1);
      expect(state.expandedFormId).toBe(1);
    });
  });

  describe("Reorder Investments", () => {
    it("should reorder investments array", () => {
      const { addInvestmentWithTypeAndOwner, updateInvestment, reorderInvestments } =
        useInvestmentStore.getState();

      // Add three investments
      addInvestmentWithTypeAndOwner("증권계좌", "홍길동"); // id: 2
      addInvestmentWithTypeAndOwner("예금계좌", "김철수"); // id: 3
      addInvestmentWithTypeAndOwner("연금계좌", "박영희"); // id: 4

      // Update names to identify them
      updateInvestment(2, "accountName", "First");
      updateInvestment(3, "accountName", "Second");
      updateInvestment(4, "accountName", "Third");

      let state = useInvestmentStore.getState();
      // Investments are prepended, so order is: [Third, Second, First]
      expect(state.investments.map((inv) => inv.accountName)).toEqual(["Third", "Second", "First"]);

      // Reorder: move First to the beginning
      const reordered = [state.investments[2]!, state.investments[0]!, state.investments[1]!];
      reorderInvestments(reordered);

      state = useInvestmentStore.getState();
      expect(state.investments.map((inv) => inv.accountName)).toEqual(["First", "Third", "Second"]);
    });

    it("should maintain investment data when reordering", () => {
      const { addInvestmentWithTypeAndOwner, addHistoryRecord, reorderInvestments } =
        useInvestmentStore.getState();

      // Add investments with history
      addInvestmentWithTypeAndOwner("증권계좌", "홍길동"); // id: 2
      addHistoryRecord(2, "2024-01-10", 500000, 600000);

      addInvestmentWithTypeAndOwner("예금계좌", "김철수"); // id: 3
      addHistoryRecord(3, "2024-01-12", 1000000, 1100000);

      let state = useInvestmentStore.getState();
      const originalFirst = state.investments[0]!;
      const originalSecond = state.investments[1]!;

      // Reverse order
      reorderInvestments([originalSecond, originalFirst]);

      state = useInvestmentStore.getState();
      // Verify data integrity
      expect(state.investments[0]!.id).toBe(2);
      expect(state.investments[0]!.records).toHaveLength(1);
      expect(state.investments[0]!.records[0]!.currentValue).toBe(600000);

      expect(state.investments[1]!.id).toBe(3);
      expect(state.investments[1]!.records).toHaveLength(1);
      expect(state.investments[1]!.records[0]!.currentValue).toBe(1100000);
    });

    it("should handle empty array reorder", () => {
      const { reorderInvestments } = useInvestmentStore.getState();

      reorderInvestments([]);

      const state = useInvestmentStore.getState();
      expect(state.investments).toEqual([]);
    });

    it("should handle single item reorder", () => {
      const { addInvestmentWithTypeAndOwner, reorderInvestments } = useInvestmentStore.getState();

      addInvestmentWithTypeAndOwner("증권계좌", "홍길동");

      let state = useInvestmentStore.getState();
      const singleItem = state.investments[0]!;

      reorderInvestments([singleItem]);

      state = useInvestmentStore.getState();
      expect(state.investments).toHaveLength(1);
      expect(state.investments[0]!.id).toBe(singleItem.id);
    });
  });

  describe("Complex Scenarios", () => {
    it("should handle multiple investments with different histories", () => {
      const { addInvestmentWithTypeAndOwner, addHistoryRecord } = useInvestmentStore.getState();

      // Add two investments
      addInvestmentWithTypeAndOwner("증권계좌", "홍길동"); // id: 2
      addInvestmentWithTypeAndOwner("예금계좌", "김철수"); // id: 3

      // Add history to first investment
      addHistoryRecord(2, "2024-01-10", 500000, 600000);
      addHistoryRecord(2, "2024-01-15", 600000, 700000);

      // Add history to second investment
      addHistoryRecord(3, "2024-01-12", 1000000, 1100000);

      const state = useInvestmentStore.getState();
      expect(state.investments).toHaveLength(2);
      expect(state.investments[1]!.records).toHaveLength(2); // First investment (index 1 due to prepend)
      expect(state.investments[0]!.records).toHaveLength(1); // Second investment (index 0 due to prepend)
    });

    it("should handle concurrent updates on same investment", () => {
      const { addInvestmentWithTypeAndOwner, updateInvestment } = useInvestmentStore.getState();

      addInvestmentWithTypeAndOwner("증권계좌", "홍길동");

      // Update both initial investment and current value
      updateInvestment(2, "initialInvestment", "500000");
      updateInvestment(2, "currentValue", "600000");

      const state = useInvestmentStore.getState();
      const investment = state.investments[0]!;
      expect(investment.initialInvestment).toBe(500000);
      expect(investment.currentValue).toBe(600000);
      // Should have one record with both values (same date replacement)
      expect(investment.records).toHaveLength(1);
      expect(investment.records[0]!).toMatchObject({
        initialInvestment: 500000,
        currentValue: 600000,
      });
    });
  });

  describe("Color Management", () => {
    it("should assign a color when adding a new investment", () => {
      const { addInvestmentWithTypeAndOwner } = useInvestmentStore.getState();

      addInvestmentWithTypeAndOwner("증권계좌", "홍길동");

      const state = useInvestmentStore.getState();
      expect(state.investments[0]!.color).toBeDefined();
      expect(typeof state.investments[0]!.color).toBe("string");
      expect(state.investments[0]!.color).toMatch(/^#[0-9a-f]{6}$/i);
    });

    it("should assign different colors to multiple investments", () => {
      const { addInvestmentWithTypeAndOwner } = useInvestmentStore.getState();

      addInvestmentWithTypeAndOwner("증권계좌", "홍길동");
      addInvestmentWithTypeAndOwner("예금계좌", "김철수");
      addInvestmentWithTypeAndOwner("연금계좌", "박영희");

      const state = useInvestmentStore.getState();
      const colors = state.investments.map((inv) => inv.color);

      // First 3 investments should have different colors
      expect(colors[0]).not.toBe(colors[1]);
      expect(colors[1]).not.toBe(colors[2]);
      expect(colors[0]).not.toBe(colors[2]);
    });

    it("should update investment color", () => {
      const { addInvestmentWithTypeAndOwner, updateInvestment } = useInvestmentStore.getState();

      addInvestmentWithTypeAndOwner("증권계좌", "홍길동");
      const initialColor = useInvestmentStore.getState().investments[0]!.color;

      updateInvestment(2, "color", "#ff0000");

      const state = useInvestmentStore.getState();
      expect(state.investments[0]!.color).toBe("#ff0000");
      expect(state.investments[0]!.color).not.toBe(initialColor);
    });

    it("should assign colors when adding investments with type and owner", () => {
      const { addInvestmentWithTypeAndOwner } = useInvestmentStore.getState();

      addInvestmentWithTypeAndOwner("증권계좌", "홍길동");

      const state = useInvestmentStore.getState();
      expect(state.investments[0]!.color).toBeDefined();
      expect(typeof state.investments[0]!.color).toBe("string");
    });
  });
});
