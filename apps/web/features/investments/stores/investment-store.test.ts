import { beforeEach, describe, expect, it, vi } from "vitest";
import { useInvestmentStore } from "./investment-store";

// localStorage mock
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

// jsdom 의 localStorage 는 getter 라 직접 대입할 수 없다.
vi.stubGlobal("localStorage", localStorageMock);

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
    });
  });

  describe("Holdings sort (moved to the account preferences)", () => {
    it("is not saved with the accounts", () => {
      // biome-ignore lint/suspicious/noExplicitAny: 테스트 대역 — 전역·store 내부 API 에 접근한다.
      const persistApi = (useInvestmentStore as any).persist;
      const partialize = persistApi.getOptions().partialize;

      expect(partialize(useInvestmentStore.getState())).toEqual({ investments: [] });
    });

    it("drops the sort an older version saved with the accounts when loading", () => {
      // biome-ignore lint/suspicious/noExplicitAny: 테스트 대역 — 전역·store 내부 API 에 접근한다.
      const persistApi = (useInvestmentStore as any).persist;
      const merge = persistApi.getOptions().merge;

      const merged = merge(
        { investments: [], holdingsSortOption: "nameAsc" },
        useInvestmentStore.getState()
      );

      expect(merged).not.toHaveProperty("holdingsSortOption");
    });
  });

  describe("Investment Management", () => {
    it("should add investment with type", () => {
      const { addInvestmentWithType } = useInvestmentStore.getState();

      addInvestmentWithType("증권계좌");

      const state = useInvestmentStore.getState();
      expect(state.investments[0]!).toMatchObject({
        accountName: "증권계좌 1",
        accountType: "증권계좌",
      });
    });

    it("should remove an investment", () => {
      const { addInvestmentWithType, removeInvestment } = useInvestmentStore.getState();

      addInvestmentWithType("증권계좌");
      const firstId = useInvestmentStore.getState().investments[0]!.id;
      addInvestmentWithType("예금계좌");
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
      const { addInvestmentWithType } = useInvestmentStore.getState();
      addInvestmentWithType("증권계좌");
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
      const { addInvestmentWithType } = useInvestmentStore.getState();
      addInvestmentWithType("증권계좌");
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

  describe("Store Reset", () => {
    it("should reset store to initial state", () => {
      const { addInvestmentWithType, resetStore } = useInvestmentStore.getState();

      // Add some data
      addInvestmentWithType("증권계좌");
      // Verify data was added
      let state = useInvestmentStore.getState();
      expect(state.investments).toHaveLength(1);

      // Reset store
      resetStore();

      // Verify reset
      state = useInvestmentStore.getState();
      expect(state.investments).toEqual([]);
    });
  });

  describe("Replace Investment", () => {
    it("replaces only the account with the same id", () => {
      const store = useInvestmentStore.getState();
      const first = store.addInvestmentWithType("ISA");
      const second = store.addInvestmentWithType("연금저축");
      const original = useInvestmentStore.getState().investments.find((i) => i.id === first)!;

      useInvestmentStore.getState().replaceInvestment({ ...original, accountName: "바뀐 이름" });

      const after = useInvestmentStore.getState().investments;
      expect(after.find((i) => i.id === first)?.accountName).toBe("바뀐 이름");
      expect(after.find((i) => i.id === second)?.accountType).toBe("연금저축");
    });
  });

  describe("Complex Scenarios", () => {
    it("should handle multiple investments with different histories", () => {
      const { addInvestmentWithType, addHistoryRecord } = useInvestmentStore.getState();

      // Add two investments
      addInvestmentWithType("증권계좌");
      const idA = useInvestmentStore.getState().investments[0]!.id;
      addInvestmentWithType("예금계좌");
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
      const { addInvestmentWithType, updateInvestment } = useInvestmentStore.getState();

      addInvestmentWithType("증권계좌");
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
      const { addInvestmentWithType } = useInvestmentStore.getState();
      addInvestmentWithType("증권계좌");
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

    it("removeStockHolding removes the specified holding only", () => {
      const { addStockHolding, removeStockHolding } = useInvestmentStore.getState();

      addStockHolding(investmentId, {
        market: "KOSPI",
        ticker: "005930",
        name: "삼성전자",
        currency: "KRW",
        quantity: 1,
      });
      addStockHolding(investmentId, {
        market: "KOSPI",
        ticker: "000660",
        name: "SK하이닉스",
        currency: "KRW",
        quantity: 1,
      });
      const firstHoldingId = useInvestmentStore
        .getState()
        .investments[0]!.holdings.find((h) => h.ticker === "005930")!.id;

      removeStockHolding(investmentId, firstHoldingId);

      const holdings = useInvestmentStore.getState().investments[0]!.holdings;
      expect(holdings).toHaveLength(1);
      expect(holdings[0]!.ticker).toBe("000660");
    });
  });

  describe("Cash Items", () => {
    let investmentId: string;

    beforeEach(() => {
      const { addInvestmentWithType } = useInvestmentStore.getState();
      addInvestmentWithType("증권계좌");
      investmentId = useInvestmentStore.getState().investments[0]!.id;
      // 새 계좌의 기본 예수금은 "Default cash item" 에서 검증한다. 여기선
      // addCashItem/update/remove 를 단독으로 보기 위해 빈 목록에서 시작한다.
      useInvestmentStore.setState((state) => ({
        investments: state.investments.map((inv) =>
          inv.id === investmentId ? { ...inv, cashItems: [] } : inv
        ),
      }));
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
      const { addInvestmentWithType } = useInvestmentStore.getState();

      addInvestmentWithType("증권계좌");

      const state = useInvestmentStore.getState();
      expect(state.investments[0]!.color).toBeDefined();
      expect(typeof state.investments[0]!.color).toBe("string");
      expect(state.investments[0]!.color).toMatch(/^#[0-9a-f]{6}$/i);
    });

    it("should assign different colors to multiple investments", () => {
      const { addInvestmentWithType } = useInvestmentStore.getState();

      addInvestmentWithType("증권계좌");
      addInvestmentWithType("예금계좌");
      addInvestmentWithType("연금계좌");

      const state = useInvestmentStore.getState();
      const colors = state.investments.map((inv) => inv.color);

      // First 3 investments should have different colors
      expect(colors[0]).not.toBe(colors[1]);
      expect(colors[1]).not.toBe(colors[2]);
      expect(colors[0]).not.toBe(colors[2]);
    });

    it("should update investment color", () => {
      const { addInvestmentWithType, updateInvestment } = useInvestmentStore.getState();

      addInvestmentWithType("증권계좌");
      const id = useInvestmentStore.getState().investments[0]!.id;
      const initialColor = useInvestmentStore.getState().investments[0]!.color;

      updateInvestment(id, "color", "#ff0000");

      const state = useInvestmentStore.getState();
      expect(state.investments[0]!.color).toBe("#ff0000");
      expect(state.investments[0]!.color).not.toBe(initialColor);
    });

    it("should assign colors when adding investments with type", () => {
      const { addInvestmentWithType } = useInvestmentStore.getState();

      addInvestmentWithType("증권계좌");

      const state = useInvestmentStore.getState();
      expect(state.investments[0]!.color).toBeDefined();
      expect(typeof state.investments[0]!.color).toBe("string");
    });
  });
  describe("Default cash item (예수금)", () => {
    it("creates a new account with one 예수금 cash item of 0원", () => {
      useInvestmentStore.getState().addInvestmentWithType("ISA 계좌");

      const { cashItems } = useInvestmentStore.getState().investments[0]!;
      expect(cashItems).toHaveLength(1);
      expect(cashItems[0]).toMatchObject({ label: "예수금", amount: 0 });
    });

    it("returns the new account id and seeds the given holdings", () => {
      const id = useInvestmentStore.getState().addInvestmentWithType("ISA 계좌", {
        holdings: [
          { market: "KOSPI", ticker: "005930", name: "삼성전자", currency: "KRW", quantity: 0 },
        ],
      });

      const created = useInvestmentStore.getState().investments.find((inv) => inv.id === id)!;
      expect(created.holdings).toHaveLength(1);
      expect(created.holdings[0]).toMatchObject({ ticker: "005930", quantity: 0, memo: "" });
      expect(typeof created.holdings[0]!.id).toBe("string");
      expect(created.cashItems).toHaveLength(1);
    });
  });
});
