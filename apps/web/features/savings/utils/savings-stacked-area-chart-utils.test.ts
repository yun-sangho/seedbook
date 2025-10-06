import type { SavingsItem } from "@web/features/savings/types/types";
import { TimeRange } from "@web/types/time.consts";
import { describe, expect, it } from "vitest";
import { prepareSavingsStackedAreaChartData } from "./savings-stacked-area-chart-utils";

describe("prepareSavingsStackedAreaChartData", () => {
  const mockSavings: SavingsItem[] = [
    {
      id: 1,
      accountName: "입출금 계좌",
      accountType: "입출금",
      accountOwner: "본인",
      currency: "원",
      balance: 1000,
      records: [
        { date: "2024-01-01", balance: 500 },
        { date: "2024-02-01", balance: 700 },
        { date: "2024-03-01", balance: 1000 },
      ],
      note: "",
      color: "#3b82f6",
    },
    {
      id: 2,
      accountName: "정기예금",
      accountType: "정기예금",
      accountOwner: "본인",
      currency: "원",
      balance: 5000,
      interestRate: 3.5,
      records: [
        { date: "2024-01-01", balance: 3000 },
        { date: "2024-02-01", balance: 4000 },
        { date: "2024-03-01", balance: 5000 },
      ],
      note: "",
      color: "#10b981",
    },
  ];

  it("히스토리가 있는 계좌의 차트 데이터를 정확히 생성해야 함", () => {
    const result = prepareSavingsStackedAreaChartData(mockSavings, TimeRange.ALL);

    expect(result.data).toHaveLength(3);
    expect(result.data[0]).toEqual({
      date: "2024-01-01",
      dateFormatted: expect.any(String),
      account_1: 500,
      account_2: 3000,
    });
    expect(result.data[1]).toEqual({
      date: "2024-02-01",
      dateFormatted: expect.any(String),
      account_1: 700,
      account_2: 4000,
    });
    expect(result.data[2]).toEqual({
      date: "2024-03-01",
      dateFormatted: expect.any(String),
      account_1: 1000,
      account_2: 5000,
    });
  });

  it("차트 설정(config)을 올바르게 생성해야 함", () => {
    const result = prepareSavingsStackedAreaChartData(mockSavings, TimeRange.ALL);

    expect(result.config).toEqual({
      account_1: {
        label: "입출금 계좌",
        color: "#3b82f6",
      },
      account_2: {
        label: "정기예금",
        color: "#10b981",
      },
    });
  });

  it("히스토리가 없는 계좌는 제외해야 함", () => {
    const savingsWithNoHistory: SavingsItem[] = [
      ...mockSavings,
      {
        id: 3,
        accountName: "신규 계좌",
        accountType: "입출금",
        accountOwner: "본인",
        currency: "원",
        balance: 0,
        records: [], // 히스토리 없음
        note: "",
        color: "#ef4444",
      },
    ];

    const result = prepareSavingsStackedAreaChartData(savingsWithNoHistory, TimeRange.ALL);

    expect(Object.keys(result.config)).toHaveLength(2);
    expect(result.config.account_3).toBeUndefined();
  });

  it("모든 계좌에 히스토리가 없으면 빈 데이터를 반환해야 함", () => {
    const savingsWithNoHistory: SavingsItem[] = [
      {
        id: 1,
        accountName: "계좌 1",
        accountType: "입출금",
        accountOwner: "본인",
        currency: "원",
        balance: 0,
        records: [],
        note: "",
        color: "#3b82f6",
      },
    ];

    const result = prepareSavingsStackedAreaChartData(savingsWithNoHistory, TimeRange.ALL);

    expect(result.data).toEqual([]);
    expect(result.config).toEqual({});
  });

  it("시간 범위 필터링이 올바르게 작동해야 함", () => {
    const now = new Date();
    const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const fourMonthsAgo = new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000);

    const savingsWithTimeRange: SavingsItem[] = [
      {
        id: 1,
        accountName: "테스트 계좌",
        accountType: "입출금",
        accountOwner: "본인",
        currency: "원",
        balance: 1000,
        records: [
          {
            date: fourMonthsAgo.toISOString().split("T")[0]!,
            balance: 500,
          },
          {
            date: threeMonthsAgo.toISOString().split("T")[0]!,
            balance: 700,
          },
          {
            date: now.toISOString().split("T")[0]!,
            balance: 1000,
          },
        ],
        note: "",
        color: "#3b82f6",
      },
    ];

    const result = prepareSavingsStackedAreaChartData(savingsWithTimeRange, TimeRange.THREE_MONTHS);

    // 3개월 범위이므로 4개월 전 데이터는 제외되어야 함
    expect(result.data.length).toBeLessThan(3);
  });

  it("날짜가 정렬되어야 함", () => {
    const result = prepareSavingsStackedAreaChartData(mockSavings, TimeRange.ALL);

    for (let i = 1; i < result.data.length; i++) {
      const prevDate = new Date(result.data[i - 1]!.date).getTime();
      const currDate = new Date(result.data[i]!.date).getTime();
      expect(currDate).toBeGreaterThanOrEqual(prevDate);
    }
  });

  it("같은 날짜에 여러 기록이 있으면 마지막 값을 사용해야 함", () => {
    const savingsWithDuplicateDates: SavingsItem[] = [
      {
        id: 1,
        accountName: "테스트 계좌",
        accountType: "입출금",
        accountOwner: "본인",
        currency: "원",
        balance: 2000,
        records: [
          { date: "2024-01-01", balance: 1000 },
          { date: "2024-01-01", balance: 1500 },
          { date: "2024-01-01", balance: 2000 }, // 마지막 값
        ],
        note: "",
        color: "#3b82f6",
      },
    ];

    const result = prepareSavingsStackedAreaChartData(savingsWithDuplicateDates, TimeRange.ALL);

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.account_1).toBe(2000);
  });

  it("미래 날짜 데이터는 제외해야 함", () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);

    const savingsWithFutureData: SavingsItem[] = [
      {
        id: 1,
        accountName: "테스트 계좌",
        accountType: "입출금",
        accountOwner: "본인",
        currency: "원",
        balance: 1000,
        records: [
          { date: "2024-01-01", balance: 500 },
          { date: futureDate.toISOString().split("T")[0]!, balance: 999999 },
        ],
        note: "",
        color: "#3b82f6",
      },
    ];

    const result = prepareSavingsStackedAreaChartData(savingsWithFutureData, TimeRange.ALL);

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.date).toBe("2024-01-01");
  });
});
