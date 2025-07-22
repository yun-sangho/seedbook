import { beforeEach, describe, expect, it, vi } from "vitest";
import { CurrencyType, DefaultOwnerType } from "../types/constants";
import { InvestmentItem, InvestmentRecord } from "../types/types";
import { useInvestmentStore } from "./investment-store";

// localStorage mock
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
global.localStorage = localStorageMock as any;

// Date mock for consistent testing
const mockDate = new Date("2024-01-15T10:00:00Z");
vi.mock("../../../../../../utils/getCurrentDate", () => ({
  getCurrentDate: () => "2024-01-15",
}));

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
      expect(state.customOwners).toEqual([]);
      expect(state.lastInvestmentId).toBe(1);
      expect(state.expandedFormId).toBe(1);
    });
  });

  describe("Investment Management", () => {
    it("should add a new investment", () => {
      const { addInvestment } = useInvestmentStore.getState();

      addInvestment();

      const state = useInvestmentStore.getState();
      expect(state.investments).toHaveLength(1);
      expect(state.investments[0]!).toMatchObject({
        id: 2,
        accountName: "투자 계좌 #2",
        accountType: "",
        accountOwner: DefaultOwnerType.SELF,
        currency: CurrencyType.KRW,
        initialInvestment: 0,
        currentValue: 0,
        records: [],
        note: "",
      });
      expect(state.lastInvestmentId).toBe(2);
      expect(state.expandedFormId).toBe(2);
    });

    it("should add investment with type", () => {
      const { addInvestmentWithType } = useInvestmentStore.getState();

      addInvestmentWithType("증권계좌");

      const state = useInvestmentStore.getState();
      expect(state.investments[0]!).toMatchObject({
        accountName: "증권계좌",
        accountType: "증권계좌",
      });
    });

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
      const { addInvestment, removeInvestment } = useInvestmentStore.getState();

      addInvestment();
      addInvestment();

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
      const { addInvestment } = useInvestmentStore.getState();
      addInvestment();
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
      const { addInvestment } = useInvestmentStore.getState();
      addInvestment();
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

  describe("Custom Owners", () => {
    it("should add custom owner", () => {
      const { addCustomOwner } = useInvestmentStore.getState();

      addCustomOwner("홍길동");

      const state = useInvestmentStore.getState();
      expect(state.customOwners).toContain("홍길동");
    });

    it("should not add duplicate custom owner", () => {
      const { addCustomOwner } = useInvestmentStore.getState();

      addCustomOwner("홍길동");
      addCustomOwner("홍길동");

      const state = useInvestmentStore.getState();
      expect(state.customOwners.filter((owner) => owner === "홍길동")).toHaveLength(1);
    });
  });

  describe("UI State", () => {
    it("should set expanded form id", () => {
      const { setExpandedFormId } = useInvestmentStore.getState();

      setExpandedFormId(5);

      const state = useInvestmentStore.getState();
      expect(state.expandedFormId).toBe(5);
    });
  });

  describe("Store Reset", () => {
    it("should reset store to initial state", () => {
      const { addInvestment, addCustomOwner, setExpandedFormId, resetStore } =
        useInvestmentStore.getState();

      // Add some data
      addInvestment();
      addCustomOwner("홍길동");
      setExpandedFormId(5);

      // Verify data was added
      let state = useInvestmentStore.getState();
      expect(state.investments).toHaveLength(1);
      expect(state.customOwners).toHaveLength(1);
      expect(state.expandedFormId).toBe(5);

      // Reset store
      resetStore();

      // Verify reset
      state = useInvestmentStore.getState();
      expect(state.investments).toEqual([]);
      expect(state.customOwners).toEqual([]);
      expect(state.lastInvestmentId).toBe(1);
      expect(state.expandedFormId).toBe(1);
    });
  });

  describe("Complex Scenarios", () => {
    it("should handle multiple investments with different histories", () => {
      const { addInvestment, addHistoryRecord } = useInvestmentStore.getState();

      // Add two investments
      addInvestment(); // id: 2
      addInvestment(); // id: 3

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
      const { addInvestment, updateInvestment } = useInvestmentStore.getState();

      addInvestment();

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
});
