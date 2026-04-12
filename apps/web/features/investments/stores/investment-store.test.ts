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
      expect(state.expandedFormId).toBe("");
    });

    it("holdingsSortOption defaults to 'default'", () => {
      const state = useInvestmentStore.getState();
      expect(state.holdingsSortOption).toBe("default");
    });
  });

  describe("Holdings Sort Option", () => {
    it("setHoldingsSortOption updates the global sort option", () => {
      const { setHoldingsSortOption } = useInvestmentStore.getState();

      setHoldingsSortOption("priceDesc");

      expect(useInvestmentStore.getState().holdingsSortOption).toBe("priceDesc");
    });

    it("setHoldingsSortOption can cycle through all valid options", () => {
      const { setHoldingsSortOption } = useInvestmentStore.getState();

      setHoldingsSortOption("priceAsc");
      expect(useInvestmentStore.getState().holdingsSortOption).toBe("priceAsc");

      setHoldingsSortOption("evalDesc");
      expect(useInvestmentStore.getState().holdingsSortOption).toBe("evalDesc");

      setHoldingsSortOption("evalAsc");
      expect(useInvestmentStore.getState().holdingsSortOption).toBe("evalAsc");

      setHoldingsSortOption("default");
      expect(useInvestmentStore.getState().holdingsSortOption).toBe("default");
    });

    it("holdingsSortOption is included in persisted state via partialize", () => {
      const { setHoldingsSortOption } = useInvestmentStore.getState();
      setHoldingsSortOption("evalDesc");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const persistApi = (useInvestmentStore as any).persist;
      const partialize = persistApi.getOptions().partialize;
      const snapshot = partialize(useInvestmentStore.getState());

      expect(snapshot.holdingsSortOption).toBe("evalDesc");
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
      const firstId = useInvestmentStore.getState().investments[0]!.id;
      addInvestmentWithTypeAndOwner("예금계좌", "김철수");
      const secondId = useInvestmentStore.getState().investments[0]!.id;

      let state = useInvestmentStore.getState();
      expect(state.investments).toHaveLength(2);

      // Remove the first-added (older) investment; second-added should remain.
      removeInvestment(firstId);

      state = useInvestmentStore.getState();
      expect(state.investments).toHaveLength(1);
      expect(state.investments[0]!.id).toBe(secondId);
    });
  });

  describe("Investment Updates", () => {
    let investmentId: string;

    beforeEach(() => {
      const { addInvestmentWithTypeAndOwner } = useInvestmentStore.getState();
      addInvestmentWithTypeAndOwner("증권계좌", "홍길동");
      investmentId = useInvestmentStore.getState().investments[0]!.id;
    });

    it("should update investment field", () => {
      const { updateInvestment } = useInvestmentStore.getState();

      updateInvestment(investmentId, "accountName", "새로운 계좌명");

      const state = useInvestmentStore.getState();
      expect(state.investments[0]!.accountName).toBe("새로운 계좌명");
    });

    it("should create record when updating currentValue", () => {
      const { updateInvestment } = useInvestmentStore.getState();

      updateInvestment(investmentId, "currentValue", "1000000");

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

      updateInvestment(investmentId, "initialInvestment", "500000");

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
      updateInvestment(investmentId, "currentValue", "1000000");

      // Second update on same day
      updateInvestment(investmentId, "currentValue", "1200000");

      const state = useInvestmentStore.getState();
      const investment = state.investments[0]!;
      expect(investment.records).toHaveLength(1);
      expect(investment.records[0]!.currentValue).toBe(1200000);
    });
  });

  describe("History Record Management", () => {
    let investmentId: string;

    beforeEach(() => {
      const { addInvestmentWithTypeAndOwner } = useInvestmentStore.getState();
      addInvestmentWithTypeAndOwner("증권계좌", "홍길동");
      investmentId = useInvestmentStore.getState().investments[0]!.id;
    });

    it("should add history record", () => {
      const { addHistoryRecord } = useInvestmentStore.getState();

      addHistoryRecord(investmentId, "2024-01-10", 500000, 600000);

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
      addHistoryRecord(investmentId, "2024-01-10", 500000, 600000);

      // Add second record with same date (should replace)
      addHistoryRecord(investmentId, "2024-01-10", 700000, 800000);

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

      addHistoryRecord(investmentId, "2024-01-10", 500000, 600000);
      addHistoryRecord(investmentId, "2024-01-05", 400000, 450000);
      addHistoryRecord(investmentId, "2024-01-15", 600000, 700000);

      const state = useInvestmentStore.getState();
      const dates = state.investments[0]!.records.map((r) => r.date);
      expect(dates).toEqual(["2024-01-15", "2024-01-10", "2024-01-05"]);
    });

    it("should add investment record with defaults", () => {
      const { addInvestmentRecord } = useInvestmentStore.getState();

      addInvestmentRecord(investmentId);

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
      addHistoryRecord(investmentId, "2024-01-10", 500000, 600000);

      // Add new record without specifying initialInvestment
      addInvestmentRecord(investmentId, { currentValue: 700000 });

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

      addInvestmentRecord(investmentId, {
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

      addInvestmentRecord(investmentId);
      updateInvestmentRecord(investmentId, 0, "currentValue", "1500000");

      const state = useInvestmentStore.getState();
      const investment = state.investments[0]!;
      expect(investment.records[0]!.currentValue).toBe(1500000);
    });

    it("should remove investment record but keep at least one", () => {
      const { addInvestmentRecord, removeInvestmentRecord } = useInvestmentStore.getState();

      addInvestmentRecord(investmentId);
      addInvestmentRecord(investmentId);

      let state = useInvestmentStore.getState();
      const investment = state.investments[0]!;
      expect(investment.records).toHaveLength(2);

      removeInvestmentRecord(investmentId, 0);

      state = useInvestmentStore.getState();
      expect(state.investments[0]!.records).toHaveLength(1);

      // Try to remove the last record - should not be removed
      removeInvestmentRecord(investmentId, 0);

      state = useInvestmentStore.getState();
      expect(state.investments[0]!.records).toHaveLength(1);
    });

    it("should remove history record by date (except latest)", () => {
      const { addHistoryRecord, removeInvestmentHistoryRecord } = useInvestmentStore.getState();

      addHistoryRecord(investmentId, "2024-01-10", 500000, 600000);
      addHistoryRecord(investmentId, "2024-01-15", 600000, 700000);
      addHistoryRecord(investmentId, "2024-01-05", 400000, 450000);

      let state = useInvestmentStore.getState();
      const investment = state.investments[0]!;
      expect(investment.records).toHaveLength(3);

      // Try to remove latest record (should not be removed)
      removeInvestmentHistoryRecord(investmentId, "2024-01-15");

      state = useInvestmentStore.getState();
      expect(state.investments[0]!.records).toHaveLength(3);

      // Remove non-latest record (should be removed)
      removeInvestmentHistoryRecord(investmentId, "2024-01-10");

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

      setExpandedFormId("5");

      const state = useInvestmentStore.getState();
      expect(state.expandedFormId).toBe("5");
    });

    it("should update expandedFormId when updating different investment", () => {
      const { addInvestmentWithTypeAndOwner, updateInvestment } = useInvestmentStore.getState();

      addInvestmentWithTypeAndOwner("증권계좌", "홍길동");
      const firstId = useInvestmentStore.getState().investments[0]!.id;
      addInvestmentWithTypeAndOwner("예금계좌", "김철수");
      const secondId = useInvestmentStore.getState().investments[0]!.id;

      // Initially expanded form is the last added one
      let state = useInvestmentStore.getState();
      expect(state.expandedFormId).toBe(secondId);

      // Update the older investment - should change expandedFormId to that id
      updateInvestment(firstId, "accountName", "Updated");

      state = useInvestmentStore.getState();
      expect(state.expandedFormId).toBe(firstId);
    });

    it("should not change expandedFormId when updating currently expanded investment", () => {
      const { addInvestmentWithTypeAndOwner, setExpandedFormId, updateInvestment } =
        useInvestmentStore.getState();

      addInvestmentWithTypeAndOwner("증권계좌", "홍길동");
      const id = useInvestmentStore.getState().investments[0]!.id;
      setExpandedFormId(id);

      // Update the currently expanded investment
      updateInvestment(id, "accountName", "Updated");

      const state = useInvestmentStore.getState();
      expect(state.expandedFormId).toBe(id); // Should remain the same
    });
  });

  describe("Store Reset", () => {
    it("should reset store to initial state", () => {
      const { addInvestmentWithTypeAndOwner, setExpandedFormId, resetStore } =
        useInvestmentStore.getState();

      // Add some data
      addInvestmentWithTypeAndOwner("증권계좌", "홍길동");
      setExpandedFormId("5");

      // Verify data was added
      let state = useInvestmentStore.getState();
      expect(state.investments).toHaveLength(1);
      expect(state.expandedFormId).toBe("5");

      // Reset store
      resetStore();

      // Verify reset
      state = useInvestmentStore.getState();
      expect(state.investments).toEqual([]);
      expect(state.expandedFormId).toBe("");
    });
  });

  describe("Reorder Investments", () => {
    it("should reorder investments array", () => {
      const { addInvestmentWithTypeAndOwner, updateInvestment, reorderInvestments } =
        useInvestmentStore.getState();

      // Add three investments
      addInvestmentWithTypeAndOwner("증권계좌", "홍길동");
      const idA = useInvestmentStore.getState().investments[0]!.id;
      addInvestmentWithTypeAndOwner("예금계좌", "김철수");
      const idB = useInvestmentStore.getState().investments[0]!.id;
      addInvestmentWithTypeAndOwner("연금계좌", "박영희");
      const idC = useInvestmentStore.getState().investments[0]!.id;

      // Update names to identify them
      updateInvestment(idA, "accountName", "First");
      updateInvestment(idB, "accountName", "Second");
      updateInvestment(idC, "accountName", "Third");

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
      addInvestmentWithTypeAndOwner("증권계좌", "홍길동");
      const idA = useInvestmentStore.getState().investments[0]!.id;
      addHistoryRecord(idA, "2024-01-10", 500000, 600000);

      addInvestmentWithTypeAndOwner("예금계좌", "김철수");
      const idB = useInvestmentStore.getState().investments[0]!.id;
      addHistoryRecord(idB, "2024-01-12", 1000000, 1100000);

      let state = useInvestmentStore.getState();
      const originalFirst = state.investments[0]!;
      const originalSecond = state.investments[1]!;

      // Reverse order
      reorderInvestments([originalSecond, originalFirst]);

      state = useInvestmentStore.getState();
      // Verify data integrity
      expect(state.investments[0]!.id).toBe(idA);
      expect(state.investments[0]!.records).toHaveLength(1);
      expect(state.investments[0]!.records[0]!.currentValue).toBe(600000);

      expect(state.investments[1]!.id).toBe(idB);
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
      addInvestmentWithTypeAndOwner("증권계좌", "홍길동");
      const idA = useInvestmentStore.getState().investments[0]!.id;
      addInvestmentWithTypeAndOwner("예금계좌", "김철수");
      const idB = useInvestmentStore.getState().investments[0]!.id;

      // Add history to first investment
      addHistoryRecord(idA, "2024-01-10", 500000, 600000);
      addHistoryRecord(idA, "2024-01-15", 600000, 700000);

      // Add history to second investment
      addHistoryRecord(idB, "2024-01-12", 1000000, 1100000);

      const state = useInvestmentStore.getState();
      expect(state.investments).toHaveLength(2);
      expect(state.investments[1]!.records).toHaveLength(2); // First investment (index 1 due to prepend)
      expect(state.investments[0]!.records).toHaveLength(1); // Second investment (index 0 due to prepend)
    });

    it("should handle concurrent updates on same investment", () => {
      const { addInvestmentWithTypeAndOwner, updateInvestment } = useInvestmentStore.getState();

      addInvestmentWithTypeAndOwner("증권계좌", "홍길동");
      const id = useInvestmentStore.getState().investments[0]!.id;

      // Update both initial investment and current value
      updateInvestment(id, "initialInvestment", "500000");
      updateInvestment(id, "currentValue", "600000");

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

  describe("Stock Holdings", () => {
    let investmentId: string;

    beforeEach(() => {
      const { addInvestmentWithTypeAndOwner } = useInvestmentStore.getState();
      addInvestmentWithTypeAndOwner("증권계좌", "홍길동");
      investmentId = useInvestmentStore.getState().investments[0]!.id;
    });

    it("adds a blank holding with empty market/ticker/currency", () => {
      const { addStockHolding } = useInvestmentStore.getState();

      addStockHolding(investmentId);

      const state = useInvestmentStore.getState();
      const holdings = state.investments[0]!.holdings;
      expect(holdings).toHaveLength(1);
      expect(holdings[0]!).toMatchObject({
        market: "",
        ticker: "",
        name: "",
        currency: "",
        quantity: 0,
        memo: "",
      });
      expect(typeof holdings[0]!.id).toBe("string");
    });

    it("addStockHolding with initial data populates market/ticker/name/currency/quantity", () => {
      const { addStockHolding } = useInvestmentStore.getState();

      addStockHolding(investmentId, {
        market: "KOSPI",
        ticker: "005930",
        name: "삼성전자",
        currency: "KRW",
        quantity: 15,
      });

      const holdings = useInvestmentStore.getState().investments[0]!.holdings;
      expect(holdings).toHaveLength(1);
      expect(holdings[0]!).toMatchObject({
        market: "KOSPI",
        ticker: "005930",
        name: "삼성전자",
        currency: "KRW",
        quantity: 15,
        memo: "",
      });
      expect(typeof holdings[0]!.id).toBe("string");
    });

    it("addStockHolding with initial data assigns a unique id per holding", () => {
      const { addStockHolding } = useInvestmentStore.getState();

      addStockHolding(investmentId, {
        market: "KOSPI",
        ticker: "005930",
        name: "삼성전자",
        currency: "KRW",
        quantity: 10,
      });
      addStockHolding(investmentId, {
        market: "KOSPI",
        ticker: "000660",
        name: "SK하이닉스",
        currency: "KRW",
        quantity: 5,
      });

      const holdings = useInvestmentStore.getState().investments[0]!.holdings;
      expect(holdings.map((h) => h.ticker)).toEqual(["005930", "000660"]);
      // Each holding receives a distinct string id (UUID)
      expect(holdings[0]!.id).not.toBe(holdings[1]!.id);
      expect(typeof holdings[0]!.id).toBe("string");
      expect(typeof holdings[1]!.id).toBe("string");
    });

    it("setStockHoldingFromSearch writes market/ticker/name/currency atomically", () => {
      const { addStockHolding, setStockHoldingFromSearch } = useInvestmentStore.getState();

      addStockHolding(investmentId);
      const holdingId = useInvestmentStore.getState().investments[0]!.holdings[0]!.id;
      setStockHoldingFromSearch(investmentId, holdingId, {
        market: "KOSPI",
        ticker: "005930",
        name: "삼성전자",
        currency: "KRW",
      });

      const holding = useInvestmentStore.getState().investments[0]!.holdings[0]!;
      expect(holding).toMatchObject({
        market: "KOSPI",
        ticker: "005930",
        name: "삼성전자",
        currency: "KRW",
      });
    });

    it("setStockHoldingFromSearch preserves quantity and memo set before selection", () => {
      const { addStockHolding, updateStockHolding, setStockHoldingFromSearch } =
        useInvestmentStore.getState();

      addStockHolding(investmentId);
      const holdingId = useInvestmentStore.getState().investments[0]!.holdings[0]!.id;
      updateStockHolding(investmentId, holdingId, "quantity", "10");
      updateStockHolding(investmentId, holdingId, "memo", "중장기 보유");

      setStockHoldingFromSearch(investmentId, holdingId, {
        market: "KOSPI",
        ticker: "005930",
        name: "삼성전자",
        currency: "KRW",
      });

      const holding = useInvestmentStore.getState().investments[0]!.holdings[0]!;
      expect(holding.quantity).toBe(10);
      expect(holding.memo).toBe("중장기 보유");
    });

    it("setStockHoldingFromSearch overwrites a previously selected stock", () => {
      const { addStockHolding, setStockHoldingFromSearch } = useInvestmentStore.getState();

      addStockHolding(investmentId);
      const holdingId = useInvestmentStore.getState().investments[0]!.holdings[0]!.id;
      setStockHoldingFromSearch(investmentId, holdingId, {
        market: "KOSPI",
        ticker: "005930",
        name: "삼성전자",
        currency: "KRW",
      });
      setStockHoldingFromSearch(investmentId, holdingId, {
        market: "NASDAQ",
        ticker: "AAPL",
        name: "Apple Inc.",
        currency: "USD",
      });

      const holding = useInvestmentStore.getState().investments[0]!.holdings[0]!;
      expect(holding).toMatchObject({
        market: "NASDAQ",
        ticker: "AAPL",
        name: "Apple Inc.",
        currency: "USD",
      });
    });

    it("removeStockHolding removes the specified holding only", () => {
      const { addStockHolding, setStockHoldingFromSearch, removeStockHolding } =
        useInvestmentStore.getState();

      addStockHolding(investmentId);
      const firstHoldingId = useInvestmentStore.getState().investments[0]!.holdings[0]!.id;
      setStockHoldingFromSearch(investmentId, firstHoldingId, {
        market: "KOSPI",
        ticker: "005930",
        name: "삼성전자",
        currency: "KRW",
      });
      addStockHolding(investmentId);
      const secondHoldingId = useInvestmentStore.getState().investments[0]!.holdings[1]!.id;
      setStockHoldingFromSearch(investmentId, secondHoldingId, {
        market: "KOSPI",
        ticker: "000660",
        name: "SK하이닉스",
        currency: "KRW",
      });

      removeStockHolding(investmentId, firstHoldingId);

      const holdings = useInvestmentStore.getState().investments[0]!.holdings;
      expect(holdings).toHaveLength(1);
      expect(holdings[0]!.ticker).toBe("000660");
    });
  });

  describe("Persist Migration", () => {
    it("v1 → v4 assigns UUID ids to legacy numeric-id investments and holdings", () => {
      // The v4 migration is a safety net: the bootstrap upgrade in
      // `lib/local-id-upgrade.ts` rewrites the localStorage envelope before
      // hydration, but the migrate function still defends against legacy
      // (numeric-id) payloads by re-assigning UUIDs.
      const legacyState = {
        investments: [
          {
            id: 2,
            accountName: "테스트",
            accountType: "증권계좌",
            accountOwner: "홍길동",
            currency: "KRW",
            initialInvestment: 0,
            currentValue: 0,
            records: [],
            holdings: [
              {
                id: 1,
                market: "KOSPI",
                ticker: "005930",
                name: "삼성전자",
                currency: "KRW",
                quantity: 10,
                memo: "",
              },
            ],
            note: "",
            color: "#3b82f6",
          },
        ],
        lastInvestmentId: 2,
      };

      // Drive the store's persist.migrate directly.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const persistApi = (useInvestmentStore as any).persist;
      const migrated = persistApi.getOptions().migrate(legacyState, 1);

      // Investment id rewritten to a UUID string.
      expect(typeof migrated.investments[0].id).toBe("string");
      expect(migrated.investments[0].id).not.toBe(2);
      // Holding id rewritten to a UUID string while other fields preserved.
      const holding = migrated.investments[0].holdings[0];
      expect(typeof holding.id).toBe("string");
      expect(holding.id).not.toBe(1);
      expect(holding.market).toBe("KOSPI");
      expect(holding.ticker).toBe("005930");
      expect(holding.currency).toBe("KRW");
      expect(holding.name).toBe("삼성전자");
      expect(holding.quantity).toBe(10);
      // Legacy lastInvestmentId field dropped.
      expect(migrated.lastInvestmentId).toBeUndefined();
    });

    it("v1 → v4 preserves string ids that are already UUIDs", () => {
      const alreadyUuidState = {
        investments: [
          {
            id: "11111111-2222-3333-4444-555555555555",
            accountName: "테스트",
            accountType: "증권계좌",
            accountOwner: "홍길동",
            currency: "KRW",
            initialInvestment: 0,
            currentValue: 0,
            records: [],
            holdings: [
              {
                id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
                market: "KOSPI",
                ticker: "005930",
                name: "삼성전자",
                currency: "KRW",
                quantity: 10,
                memo: "",
              },
            ],
            note: "",
            color: "#3b82f6",
          },
        ],
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const persistApi = (useInvestmentStore as any).persist;
      const migrated = persistApi.getOptions().migrate(alreadyUuidState, 1);

      expect(migrated.investments[0].id).toBe("11111111-2222-3333-4444-555555555555");
      const holding = migrated.investments[0].holdings[0];
      expect(holding.id).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
      expect(holding.market).toBe("KOSPI");
      expect(holding.ticker).toBe("005930");
      expect(holding.currency).toBe("KRW");
    });

    it("v1 → v4 assigns UUID ids to legacy numeric-id cash items", () => {
      const legacyStateWithCash = {
        investments: [
          {
            id: 2,
            accountName: "테스트",
            accountType: "증권계좌",
            accountOwner: "홍길동",
            currency: "KRW",
            initialInvestment: 0,
            currentValue: 0,
            records: [],
            holdings: [],
            cashItems: [{ id: 1, label: "예수금", amount: 100000 }],
            note: "",
            color: "#3b82f6",
          },
        ],
        lastInvestmentId: 2,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const persistApi = (useInvestmentStore as any).persist;
      const migrated = persistApi.getOptions().migrate(legacyStateWithCash, 2);

      const cashItem = migrated.investments[0].cashItems[0];
      expect(typeof cashItem.id).toBe("string");
      expect(cashItem.id).not.toBe(1);
      expect(cashItem.label).toBe("예수금");
      expect(cashItem.amount).toBe(100000);
      // holdings remain an empty array
      expect(migrated.investments[0].holdings).toEqual([]);
    });
  });

  describe("Cash Items", () => {
    let investmentId: string;

    beforeEach(() => {
      const { addInvestmentWithTypeAndOwner } = useInvestmentStore.getState();
      addInvestmentWithTypeAndOwner("증권계좌", "홍길동");
      investmentId = useInvestmentStore.getState().investments[0]!.id;
    });

    it("addCashItem appends a new item with default label 예수금 and amount 0", () => {
      const { addCashItem } = useInvestmentStore.getState();

      addCashItem(investmentId);

      const cashItems = useInvestmentStore.getState().investments[0]!.cashItems;
      expect(cashItems).toHaveLength(1);
      expect(cashItems[0]!).toMatchObject({
        label: "예수금",
        amount: 0,
      });
      expect(typeof cashItems[0]!.id).toBe("string");
    });

    it("addCashItem with initial data populates label and amount", () => {
      const { addCashItem } = useInvestmentStore.getState();

      addCashItem(investmentId, { label: "CMA", amount: 500000 });

      const cashItems = useInvestmentStore.getState().investments[0]!.cashItems;
      expect(cashItems).toHaveLength(1);
      expect(cashItems[0]!).toMatchObject({
        label: "CMA",
        amount: 500000,
      });
      expect(typeof cashItems[0]!.id).toBe("string");
    });

    it("addCashItem mixes with and without initial data preserving order", () => {
      const { addCashItem } = useInvestmentStore.getState();

      addCashItem(investmentId, { label: "CMA", amount: 500000 });
      addCashItem(investmentId);
      addCashItem(investmentId, { label: "MMF", amount: 1000000 });

      const cashItems = useInvestmentStore.getState().investments[0]!.cashItems;
      expect(cashItems.map((c) => ({ label: c.label, amount: c.amount }))).toEqual([
        { label: "CMA", amount: 500000 },
        { label: "예수금", amount: 0 },
        { label: "MMF", amount: 1000000 },
      ]);
    });

    it("addCashItem assigns a unique id per item", () => {
      const { addCashItem } = useInvestmentStore.getState();

      addCashItem(investmentId);
      addCashItem(investmentId);
      addCashItem(investmentId);

      const cashItems = useInvestmentStore.getState().investments[0]!.cashItems;
      const ids = cashItems.map((c) => c.id);
      expect(new Set(ids).size).toBe(3);
      ids.forEach((id) => expect(typeof id).toBe("string"));
    });

    it("updateCashItem updates label field", () => {
      const { addCashItem, updateCashItem } = useInvestmentStore.getState();
      addCashItem(investmentId);
      const cashItemId = useInvestmentStore.getState().investments[0]!.cashItems[0]!.id;

      updateCashItem(investmentId, cashItemId, "label", "CMA");

      const cashItems = useInvestmentStore.getState().investments[0]!.cashItems;
      expect(cashItems[0]!.label).toBe("CMA");
    });

    it("updateCashItem parses numeric string for amount", () => {
      const { addCashItem, updateCashItem } = useInvestmentStore.getState();
      addCashItem(investmentId);
      const cashItemId = useInvestmentStore.getState().investments[0]!.cashItems[0]!.id;

      updateCashItem(investmentId, cashItemId, "amount", "1,000,000");

      const cashItems = useInvestmentStore.getState().investments[0]!.cashItems;
      expect(cashItems[0]!.amount).toBe(1000000);
    });

    it("updateCashItem treats empty string as 0", () => {
      const { addCashItem, updateCashItem } = useInvestmentStore.getState();
      addCashItem(investmentId);
      const cashItemId = useInvestmentStore.getState().investments[0]!.cashItems[0]!.id;
      updateCashItem(investmentId, cashItemId, "amount", "500000");

      updateCashItem(investmentId, cashItemId, "amount", "");

      const cashItems = useInvestmentStore.getState().investments[0]!.cashItems;
      expect(cashItems[0]!.amount).toBe(0);
    });

    it("removeCashItem removes only the specified item", () => {
      const { addCashItem, updateCashItem, removeCashItem } = useInvestmentStore.getState();
      addCashItem(investmentId);
      const firstCashItemId = useInvestmentStore.getState().investments[0]!.cashItems[0]!.id;
      updateCashItem(investmentId, firstCashItemId, "label", "예수금");
      addCashItem(investmentId);
      const secondCashItemId = useInvestmentStore.getState().investments[0]!.cashItems[1]!.id;
      updateCashItem(investmentId, secondCashItemId, "label", "CMA");

      removeCashItem(investmentId, firstCashItemId);

      const cashItems = useInvestmentStore.getState().investments[0]!.cashItems;
      expect(cashItems).toHaveLength(1);
      expect(cashItems[0]!.label).toBe("CMA");
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
      const id = useInvestmentStore.getState().investments[0]!.id;
      const initialColor = useInvestmentStore.getState().investments[0]!.color;

      updateInvestment(id, "color", "#ff0000");

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
