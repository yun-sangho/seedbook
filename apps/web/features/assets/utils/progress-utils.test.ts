import type { DebtsItem } from "@web/features/debts/types/types";
import type { InvestmentItem } from "@web/features/investments/types/types";
import type { SavingsItem } from "@web/features/savings/types/types";
import { describe, expect, it } from "vitest";
import { generateCumulativeProgressPoints } from "./progress-utils";

describe("generateCumulativeProgressPoints", () => {
  it("should generate progress points from investment records", () => {
    const investments: InvestmentItem[] = [
      {
        id: 1,
        accountName: "Test Account",
        accountType: "ISA",
        accountOwner: "본인",
        currency: "KRW",
        initialInvestment: 1000,
        currentValue: 1200,
        records: [
          { date: "2024-01-01", initialInvestment: 1000, currentValue: 1000 },
          { date: "2024-02-01", initialInvestment: 1000, currentValue: 1100 },
          { date: "2024-03-01", initialInvestment: 1000, currentValue: 1200 },
        ],
        holdings: [],
        note: "",
        color: "#3b82f6",
      },
    ];

    const result = generateCumulativeProgressPoints(investments, [], [], []);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      date: "2024-01-01",
      totalAssets: 1000,
      netAssets: 1000,
      investments: 1000,
      savings: 0,
      realAssets: 0,
      loans: 0,
    });
    expect(result[2]).toEqual({
      date: "2024-03-01",
      totalAssets: 1200,
      netAssets: 1200,
      investments: 1200,
      savings: 0,
      realAssets: 0,
      loans: 0,
    });
  });

  it("should merge multiple asset types on the same date", () => {
    const investments: InvestmentItem[] = [
      {
        id: 1,
        accountName: "투자계좌",
        accountType: "ISA",
        accountOwner: "본인",
        currency: "KRW",
        initialInvestment: 1000,
        currentValue: 1000,
        records: [{ date: "2024-01-01", initialInvestment: 1000, currentValue: 1000 }],
        holdings: [],
        note: "",
        color: "#3b82f6",
      },
    ];

    const savings: SavingsItem[] = [
      {
        id: 1,
        accountName: "저축계좌",
        accountType: "입출금",
        accountOwner: "본인",
        currency: "KRW",
        balance: 500,
        records: [{ date: "2024-01-01", balance: 500 }],
        note: "",
        color: "#10b981",
      },
    ];

    const result = generateCumulativeProgressPoints(investments, savings, [], []);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      date: "2024-01-01",
      totalAssets: 1500, // 1000 + 500
      netAssets: 1500,
      investments: 1000,
      savings: 500,
      realAssets: 0,
      loans: 0,
    });
  });

  it("should calculate net assets correctly with loans", () => {
    const investments: InvestmentItem[] = [
      {
        id: 1,
        accountName: "투자계좌",
        accountType: "ISA",
        accountOwner: "본인",
        currency: "KRW",
        initialInvestment: 2000,
        currentValue: 2000,
        records: [{ date: "2024-01-01", initialInvestment: 2000, currentValue: 2000 }],
        holdings: [],
        note: "",
        color: "#3b82f6",
      },
    ];

    const loans: DebtsItem[] = [
      {
        id: 1,
        loanName: "주택담보대출",
        loanType: "주택담보",
        loanOwner: "본인",
        lender: "은행",
        amount: 1000,
        interestRate: 3.5,
        maturityDate: "2024-01-01",
        monthlyPayment: 50,
        note: "",
      },
    ];

    const result = generateCumulativeProgressPoints(investments, [], [], loans);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      date: "2024-01-01",
      totalAssets: 2000,
      netAssets: 1000, // 2000 - 1000
      investments: 2000,
      savings: 0,
      realAssets: 0,
      loans: 1000,
    });
  });

  it("should accumulate values across multiple dates", () => {
    const investments: InvestmentItem[] = [
      {
        id: 1,
        accountName: "계좌1",
        accountType: "ISA",
        accountOwner: "본인",
        currency: "KRW",
        initialInvestment: 1000,
        currentValue: 1300,
        records: [
          { date: "2024-01-01", initialInvestment: 1000, currentValue: 1000 },
          { date: "2024-02-01", initialInvestment: 1000, currentValue: 1100 },
        ],
        holdings: [],
        note: "",
        color: "#3b82f6",
      },
      {
        id: 2,
        accountName: "계좌2",
        accountType: "퇴직연금",
        accountOwner: "본인",
        currency: "KRW",
        initialInvestment: 500,
        currentValue: 600,
        records: [{ date: "2024-02-01", initialInvestment: 500, currentValue: 500 }],
        holdings: [],
        note: "",
        color: "#10b981",
      },
    ];

    const result = generateCumulativeProgressPoints(investments, [], [], []);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      date: "2024-01-01",
      totalAssets: 1000,
      netAssets: 1000,
      investments: 1000,
      savings: 0,
      realAssets: 0,
      loans: 0,
    });
    expect(result[1]).toEqual({
      date: "2024-02-01",
      totalAssets: 1600, // 1100 (계좌1 업데이트) + 500 (계좌2 신규)
      netAssets: 1600,
      investments: 1600,
      savings: 0,
      realAssets: 0,
      loans: 0,
    });
  });

  it("should filter out invalid dates", () => {
    const investments: InvestmentItem[] = [
      {
        id: 1,
        accountName: "계좌1",
        accountType: "ISA",
        accountOwner: "본인",
        currency: "KRW",
        initialInvestment: 1000,
        currentValue: 1000,
        records: [
          { date: "2024-01-01", initialInvestment: 1000, currentValue: 1000 },
          { date: "", initialInvestment: 500, currentValue: 500 }, // 빈 날짜
          { date: "invalid-date", initialInvestment: 300, currentValue: 300 }, // 유효하지 않은 날짜
        ],
        holdings: [],
        note: "",
        color: "#3b82f6",
      },
    ];

    const result = generateCumulativeProgressPoints(investments, [], [], []);

    // 유효한 날짜만 포함
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      date: "2024-01-01",
      totalAssets: 1000,
      netAssets: 1000,
      investments: 1000,
      savings: 0,
      realAssets: 0,
      loans: 0,
    });
  });
});
