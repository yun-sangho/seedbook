import { describe, expect, it } from "vitest";
import type { SavingsItem } from "../types/types";
import { prepareMonthlySavingsSummary } from "./monthly-summary-utils";

describe("prepareMonthlySavingsSummary", () => {
  it("빈 배열을 처리해야 함", () => {
    const result = prepareMonthlySavingsSummary([]);
    expect(result).toEqual([]);
  });

  it("히스토리가 없는 계좌는 무시해야 함", () => {
    const savings: SavingsItem[] = [
      {
        id: "1",
        accountName: "테스트 계좌",
        accountType: "입출금",
        currency: "원",
        balance: 1000,
        records: [],
        note: "",
        color: "#3b82f6",
      },
    ];

    const result = prepareMonthlySavingsSummary(savings);
    expect(result).toEqual([]);
  });

  it("단일 계좌의 월별 요약을 생성해야 함", () => {
    const savings: SavingsItem[] = [
      {
        id: "1",
        accountName: "테스트 계좌",
        accountType: "입출금",
        currency: "원",
        balance: 1000,
        records: [
          { date: "2024-01-15", balance: 500 },
          { date: "2024-02-20", balance: 700 },
          { date: "2024-03-10", balance: 1000 },
        ],
        note: "",
        color: "#3b82f6",
      },
    ];

    const result = prepareMonthlySavingsSummary(savings);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      yearMonth: "2024-03",
      displayMonth: "2024년 3월",
      balance: 1000,
      change: 300, // 1000 - 700
      hasChange: true,
    });
    expect(result[1]).toEqual({
      yearMonth: "2024-02",
      displayMonth: "2024년 2월",
      balance: 700,
      change: 200, // 700 - 500
      hasChange: true,
    });
    expect(result[2]).toEqual({
      yearMonth: "2024-01",
      displayMonth: "2024년 1월",
      balance: 500,
      change: 0,
      hasChange: false, // 직전 월 없음
    });
  });

  it("여러 계좌의 잔액을 합산해야 함", () => {
    const savings: SavingsItem[] = [
      {
        id: "1",
        accountName: "계좌 1",
        accountType: "입출금",
        currency: "원",
        balance: 500,
        records: [
          { date: "2024-01-10", balance: 300 },
          { date: "2024-02-10", balance: 500 },
        ],
        note: "",
        color: "#3b82f6",
      },
      {
        id: "2",
        accountName: "계좌 2",
        accountType: "정기예금",
        currency: "원",
        balance: 1000,
        records: [
          { date: "2024-01-15", balance: 700 },
          { date: "2024-02-15", balance: 1000 },
        ],
        note: "",
        color: "#10b981",
      },
    ];

    const result = prepareMonthlySavingsSummary(savings);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      yearMonth: "2024-02",
      displayMonth: "2024년 2월",
      balance: 1500, // 500 + 1000
      change: 500, // 1500 - 1000
      hasChange: true,
    });
    expect(result[1]).toEqual({
      yearMonth: "2024-01",
      displayMonth: "2024년 1월",
      balance: 1000, // 300 + 700
      change: 0,
      hasChange: false,
    });
  });

  it("같은 날짜에 여러 기록이 있으면 잔액을 합산해야 함", () => {
    const savings: SavingsItem[] = [
      {
        id: "1",
        accountName: "계좌 1",
        accountType: "입출금",
        currency: "원",
        balance: 500,
        records: [{ date: "2024-01-15", balance: 500 }],
        note: "",
        color: "#3b82f6",
      },
      {
        id: "2",
        accountName: "계좌 2",
        accountType: "정기예금",
        currency: "원",
        balance: 300,
        records: [{ date: "2024-01-15", balance: 300 }],
        note: "",
        color: "#10b981",
      },
    ];

    const result = prepareMonthlySavingsSummary(savings);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      yearMonth: "2024-01",
      displayMonth: "2024년 1월",
      balance: 800, // 500 + 300
      change: 0,
      hasChange: false,
    });
  });

  it("최신순으로 정렬되어야 함", () => {
    const savings: SavingsItem[] = [
      {
        id: "1",
        accountName: "테스트 계좌",
        accountType: "입출금",
        currency: "원",
        balance: 1000,
        records: [
          { date: "2023-12-01", balance: 100 },
          { date: "2024-01-01", balance: 200 },
          { date: "2024-03-01", balance: 400 },
          { date: "2024-02-01", balance: 300 },
        ],
        note: "",
        color: "#3b82f6",
      },
    ];

    const result = prepareMonthlySavingsSummary(savings);

    expect(result.map((r) => r.yearMonth)).toEqual(["2024-03", "2024-02", "2024-01", "2023-12"]);
  });

  it("연도를 넘어가는 증감량을 계산해야 함", () => {
    const savings: SavingsItem[] = [
      {
        id: "1",
        accountName: "테스트 계좌",
        accountType: "입출금",
        currency: "원",
        balance: 2000,
        records: [
          { date: "2023-12-31", balance: 1000 },
          { date: "2024-01-01", balance: 1500 },
          { date: "2024-02-01", balance: 2000 },
        ],
        note: "",
        color: "#3b82f6",
      },
    ];

    const result = prepareMonthlySavingsSummary(savings);

    expect(result).toHaveLength(3);

    // 2024년 2월
    expect(result[0]).toEqual({
      yearMonth: "2024-02",
      displayMonth: "2024년 2월",
      balance: 2000,
      change: 500, // 2000 - 1500
      hasChange: true,
    });

    // 2024년 1월 - 직전 연도(2023년 12월)와 비교
    expect(result[1]).toEqual({
      yearMonth: "2024-01",
      displayMonth: "2024년 1월",
      balance: 1500,
      change: 500, // 1500 - 1000
      hasChange: true,
    });

    // 2023년 12월
    expect(result[2]).toEqual({
      yearMonth: "2023-12",
      displayMonth: "2023년 12월",
      balance: 1000,
      change: 0,
      hasChange: false,
    });
  });

  it("음수 증감량을 처리해야 함", () => {
    const savings: SavingsItem[] = [
      {
        id: "1",
        accountName: "테스트 계좌",
        accountType: "입출금",
        currency: "원",
        balance: 500,
        records: [
          { date: "2024-01-01", balance: 1000 },
          { date: "2024-02-01", balance: 500 }, // 감소
        ],
        note: "",
        color: "#3b82f6",
      },
    ];

    const result = prepareMonthlySavingsSummary(savings);

    expect(result[0]).toEqual({
      yearMonth: "2024-02",
      displayMonth: "2024년 2월",
      balance: 500,
      change: -500, // 500 - 1000 = -500
      hasChange: true,
    });
  });

  it("월별 데이터가 불연속적이어도 직전 데이터와 비교해야 함", () => {
    const savings: SavingsItem[] = [
      {
        id: "1",
        accountName: "테스트 계좌",
        accountType: "입출금",
        currency: "원",
        balance: 1000,
        records: [
          { date: "2024-01-01", balance: 500 },
          { date: "2024-03-01", balance: 800 }, // 2월 데이터 없음
          { date: "2024-06-01", balance: 1000 }, // 4, 5월 데이터 없음
        ],
        note: "",
        color: "#3b82f6",
      },
    ];

    const result = prepareMonthlySavingsSummary(savings);

    expect(result).toHaveLength(3);

    // 2024년 6월 - 직전은 3월
    expect(result[0]).toEqual({
      yearMonth: "2024-06",
      displayMonth: "2024년 6월",
      balance: 1000,
      change: 200, // 1000 - 800
      hasChange: true,
    });

    // 2024년 3월 - 직전은 1월
    expect(result[1]).toEqual({
      yearMonth: "2024-03",
      displayMonth: "2024년 3월",
      balance: 800,
      change: 300, // 800 - 500
      hasChange: true,
    });

    // 2024년 1월 - 직전 없음
    expect(result[2]).toEqual({
      yearMonth: "2024-01",
      displayMonth: "2024년 1월",
      balance: 500,
      change: 0,
      hasChange: false,
    });
  });
});
