import { describe, expect, it } from "vitest";
import { SavingsItem } from "../types/types";
import { prepareSavingsChartData, TimeRange } from "./savings-chart-utils";

describe("prepareSavingsChartData", () => {
  const mockSavings: SavingsItem[] = [
    {
      id: 1,
      accountName: "Test Account 1",
      accountType: "입출금",
      accountOwner: "본인",
      currency: "KRW",
      balance: 1000, // 만원
      interestRate: 2.5,
      color: "#3b82f6",
      note: "",
      records: [
        { date: "2024-01-01", balance: 800 },
        { date: "2024-02-01", balance: 900 },
        { date: "2024-03-01", balance: 1000 },
      ],
    },
    {
      id: 2,
      accountName: "Test Account 2",
      accountType: "예적금",
      accountOwner: "배우자",
      currency: "KRW",
      balance: 500,
      interestRate: 3.0,
      color: "#ef4444",
      note: "",
      records: [
        { date: "2024-01-01", balance: 300 },
        { date: "2024-02-01", balance: 400 },
        { date: "2024-03-01", balance: 500 },
      ],
    },
  ];

  it("should return all data points when timeRange is ALL", () => {
    const result = prepareSavingsChartData(mockSavings, TimeRange.ALL);

    // 3 unique dates (aggregated by date across all accounts)
    expect(result).toHaveLength(3);
    expect(result.some((point) => point.date === "2024-01-01")).toBe(true);
    expect(result.some((point) => point.date === "2024-03-01")).toBe(true);
  });

  it("should filter data by time range (ONE_MONTH)", () => {
    const result = prepareSavingsChartData(mockSavings, TimeRange.ONE_MONTH);

    // ONE_MONTH = 30 days from most recent date (2024-03-01)
    // Should only include dates from 2024-02-01 onwards
    const cutoffDate = new Date("2024-01-31");
    expect(result.every((point) => new Date(point.date) >= cutoffDate)).toBe(true);
  });

  it("should aggregate balance correctly", () => {
    const result = prepareSavingsChartData(mockSavings, TimeRange.ALL);

    const firstPoint = result.find((p) => p.date === "2024-01-01");
    expect(firstPoint?.balance).toBe(800 + 300); // 1100 만원

    const lastPoint = result.find((p) => p.date === "2024-03-01");
    expect(lastPoint?.balance).toBe(1000 + 500); // 1500 만원
  });

  it("should handle empty savings array", () => {
    const result = prepareSavingsChartData([], TimeRange.ALL);
    expect(result).toHaveLength(0);
  });

  it("should handle savings with no records", () => {
    const savingsWithoutRecords: SavingsItem[] = [
      {
        id: 1,
        accountName: "Empty Account",
        accountType: "입출금",
        accountOwner: "본인",
        currency: "KRW",
        balance: 1000,
        interestRate: 2.5,
        color: "#3b82f6",
        note: "",
        records: [],
      },
    ];

    const result = prepareSavingsChartData(savingsWithoutRecords, TimeRange.ALL);
    expect(result).toHaveLength(0);
  });

  it("should sort data points by date", () => {
    const result = prepareSavingsChartData(mockSavings, TimeRange.ALL);

    for (let i = 1; i < result.length; i++) {
      expect(new Date(result[i]!.date) >= new Date(result[i - 1]!.date)).toBe(true);
    }
  });

  it("should handle FIVE_YEARS time range", () => {
    const longTermSavings: SavingsItem[] = [
      {
        id: 1,
        accountName: "Long Term",
        accountType: "예적금",
        accountOwner: "본인",
        currency: "KRW",
        balance: 10000,
        interestRate: 4.0,
        color: "#3b82f6",
        note: "",
        records: [
          { date: "2019-01-01", balance: 5000 },
          { date: "2020-01-01", balance: 6000 },
          { date: "2021-01-01", balance: 7000 },
          { date: "2022-01-01", balance: 8000 },
          { date: "2023-01-01", balance: 9000 },
          { date: "2024-01-01", balance: 10000 },
        ],
      },
    ];

    const result = prepareSavingsChartData(longTermSavings, TimeRange.FIVE_YEARS);

    // Should only include last 5 years (1826 days)
    const oldestDate = new Date("2024-01-01");
    oldestDate.setDate(oldestDate.getDate() - 1826);

    expect(result.every((point) => new Date(point.date) >= oldestDate)).toBe(true);
  });

  it("should preserve 만원 units (no conversion)", () => {
    const result = prepareSavingsChartData(mockSavings, TimeRange.ALL);

    // Verify all balance values are in 만원 (no multiplication by 10000)
    expect(result.every((point) => point.balance >= 300 && point.balance <= 1500)).toBe(true);
  });
});
