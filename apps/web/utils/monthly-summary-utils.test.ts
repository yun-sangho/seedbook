import { InvestmentItem } from "@web/features/investments/types/types";
import { describe, expect, it } from "vitest";
import { prepareMonthlyInvestmentSummary } from "./monthly-summary-utils";

describe("prepareMonthlyInvestmentSummary", () => {
  it("should return empty array when no records exist", () => {
    const investments: InvestmentItem[] = [
      {
        id: "1",
        accountName: "Test Account",
        accountType: "ISA",
        currency: "KRW",
        initialInvestment: 1000,
        currentValue: 1100,
        records: [],
        note: "",
        color: "#3b82f6",
        holdings: [],
        cashItems: [],
      },
    ];

    const result = prepareMonthlyInvestmentSummary(investments);
    expect(result).toEqual([]);
  });

  it("should aggregate records by month and use the last record of each month", () => {
    const investments: InvestmentItem[] = [
      {
        id: "1",
        accountName: "Account 1",
        accountType: "ISA",
        currency: "KRW",
        initialInvestment: 1000,
        currentValue: 1100,
        records: [
          { date: "2024-01-15", initialInvestment: 1000, currentValue: 1050 },
          { date: "2024-01-30", initialInvestment: 1200, currentValue: 1300 }, // Last in Jan
          { date: "2024-02-15", initialInvestment: 1500, currentValue: 1600 },
        ],
        note: "",
        color: "#3b82f6",
        holdings: [],
        cashItems: [],
      },
    ];

    const result = prepareMonthlyInvestmentSummary(investments);

    expect(result).toHaveLength(2);
    // Should be sorted by date descending (Feb first, then Jan)
    expect(result[0]!.yearMonth).toBe("2024-02");
    expect(result[0]!.initialInvestment).toBe(1500);
    expect(result[0]!.currentValue).toBe(1600);
    // Feb profit: 1600 - 1300 (previous month) = 300
    expect(result[0]!.profit).toBe(300);
    expect(result[0]!.displayMonth).toBe("2024년 2월");

    expect(result[1]!.yearMonth).toBe("2024-01");
    expect(result[1]!.initialInvestment).toBe(1200);
    expect(result[1]!.currentValue).toBe(1300);
    // Jan profit: 1300 - 1200 (initial investment, first month) = 100
    expect(result[1]!.profit).toBe(100);
    expect(result[1]!.displayMonth).toBe("2024년 1월");
  });

  it("should aggregate multiple accounts for the same month", () => {
    const investments: InvestmentItem[] = [
      {
        id: "1",
        accountName: "Account 1",
        accountType: "ISA",
        currency: "KRW",
        initialInvestment: 1000,
        currentValue: 1100,
        records: [{ date: "2024-01-30", initialInvestment: 1000, currentValue: 1100 }],
        holdings: [],
        cashItems: [],
        note: "",
        color: "#3b82f6",
      },
      {
        id: "2",
        accountName: "Account 2",
        accountType: "일반계좌",
        currency: "KRW",
        initialInvestment: 2000,
        currentValue: 2200,
        records: [{ date: "2024-01-25", initialInvestment: 2000, currentValue: 2200 }],
        note: "",
        color: "#3b82f6",
        holdings: [],
        cashItems: [],
      },
    ];

    const result = prepareMonthlyInvestmentSummary(investments);

    expect(result).toHaveLength(1);
    expect(result[0]!.yearMonth).toBe("2024-01");
    expect(result[0]!.initialInvestment).toBe(3000); // 1000 + 2000
    expect(result[0]!.currentValue).toBe(3300); // 1100 + 2200
    expect(result[0]!.profit).toBe(300);
  });

  it("should use the last record per account for each month", () => {
    const investments: InvestmentItem[] = [
      {
        id: "1",
        accountName: "Account 1",
        accountType: "ISA",
        currency: "KRW",
        initialInvestment: 1000,
        currentValue: 1100,
        records: [
          { date: "2024-01-10", initialInvestment: 1000, currentValue: 1050 },
          { date: "2024-01-20", initialInvestment: 1100, currentValue: 1150 },
          { date: "2024-01-30", initialInvestment: 1200, currentValue: 1300 }, // Last
        ],
        holdings: [],
        cashItems: [],
        note: "",
        color: "#3b82f6",
      },
      {
        id: "2",
        accountName: "Account 2",
        accountType: "일반계좌",
        currency: "KRW",
        initialInvestment: 2000,
        currentValue: 2200,
        records: [
          { date: "2024-01-05", initialInvestment: 2000, currentValue: 2100 },
          { date: "2024-01-25", initialInvestment: 2500, currentValue: 2700 }, // Last
        ],
        note: "",
        color: "#3b82f6",
        holdings: [],
        cashItems: [],
      },
    ];

    const result = prepareMonthlyInvestmentSummary(investments);

    expect(result).toHaveLength(1);
    expect(result[0]!.yearMonth).toBe("2024-01");
    expect(result[0]!.initialInvestment).toBe(3700); // 1200 + 2500
    expect(result[0]!.currentValue).toBe(4000); // 1300 + 2700
    expect(result[0]!.profit).toBe(300);
  });

  it("should calculate return rate correctly", () => {
    const investments: InvestmentItem[] = [
      {
        id: "1",
        accountName: "Account 1",
        accountType: "ISA",
        currency: "KRW",
        initialInvestment: 1000,
        currentValue: 1100,
        records: [{ date: "2024-01-30", initialInvestment: 1000, currentValue: 1200 }],
        note: "",
        color: "#3b82f6",
        holdings: [],
        cashItems: [],
      },
    ];

    const result = prepareMonthlyInvestmentSummary(investments);

    // First month: compared to initial investment
    expect(result[0]!.returnRate).toBe(20); // (1200 - 1000) / 1000 * 100 = 20%
  });

  it("should calculate profit and return rate based on previous month", () => {
    const investments: InvestmentItem[] = [
      {
        id: "1",
        accountName: "Account 1",
        accountType: "ISA",
        currency: "KRW",
        initialInvestment: 1000,
        currentValue: 1500,
        records: [
          { date: "2024-01-30", initialInvestment: 1000, currentValue: 1000 }, // Jan: 1000
          { date: "2024-02-28", initialInvestment: 1000, currentValue: 1200 }, // Feb: 1200
          { date: "2024-03-31", initialInvestment: 1000, currentValue: 1500 }, // Mar: 1500
        ],
        note: "",
        color: "#3b82f6",
        holdings: [],
        cashItems: [],
      },
    ];

    const result = prepareMonthlyInvestmentSummary(investments);

    expect(result).toHaveLength(3);

    // March (most recent, index 0)
    expect(result[0]!.yearMonth).toBe("2024-03");
    expect(result[0]!.currentValue).toBe(1500);
    expect(result[0]!.profit).toBe(300); // 1500 - 1200 (previous month)
    expect(result[0]!.returnRate).toBe(25); // (1500 - 1200) / 1200 * 100 = 25%

    // February (index 1)
    expect(result[1]!.yearMonth).toBe("2024-02");
    expect(result[1]!.currentValue).toBe(1200);
    expect(result[1]!.profit).toBe(200); // 1200 - 1000 (previous month)
    expect(result[1]!.returnRate).toBe(20); // (1200 - 1000) / 1000 * 100 = 20%

    // January (oldest, index 2)
    expect(result[2]!.yearMonth).toBe("2024-01");
    expect(result[2]!.currentValue).toBe(1000);
    expect(result[2]!.profit).toBe(0); // 1000 - 1000 (initial investment, first month)
    expect(result[2]!.returnRate).toBe(0); // No change
  });
});
