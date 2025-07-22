import { InvestmentItem } from "@web/features/investments/types/types";
import { describe, expect, test } from "vitest";
import { prepareInvestmentChartData } from "./investment-chart-utils";

describe("prepareInvestmentChartData", () => {
  // 테스트용 날짜 생성 헬퍼
  const createDate = (daysAgo: number): string => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date.toISOString().split("T")[0] || "";
  };

  // 테스트용 투자 계좌 생성 헬퍼
  const createInvestment = (
    id: number,
    accountName: string,
    records: { daysAgo: number; currentValue: number; initialInvestment: number }[]
  ): InvestmentItem => ({
    id,
    accountName,
    accountType: "주식",
    accountOwner: "본인",
    currency: "원",
    initialInvestment: records[records.length - 1]?.initialInvestment || 0,
    currentValue: records[records.length - 1]?.currentValue || 0,
    records: records.map((record) => ({
      date: createDate(record.daysAgo),
      currentValue: record.currentValue,
      initialInvestment: record.initialInvestment,
    })),
    note: "",
  });

  describe("기본 기능 테스트", () => {
    test("빈 배열을 전달하면 빈 결과를 반환해야 함", () => {
      const result = prepareInvestmentChartData([], "30days");
      expect(result).toEqual([]);
    });

    test("히스토리가 없는 계좌들은 결과에서 제외되어야 함", () => {
      const investments: InvestmentItem[] = [
        createInvestment(1, "계좌1", []), // 히스토리 없음
        createInvestment(2, "계좌2", []), // 히스토리 없음
      ];

      const result = prepareInvestmentChartData(investments, "30days");
      expect(result).toEqual([]);
    });

    test("단일 계좌, 단일 기록", () => {
      const investments: InvestmentItem[] = [
        createInvestment(1, "계좌1", [{ daysAgo: 5, currentValue: 1000, initialInvestment: 800 }]),
      ];

      const result = prepareInvestmentChartData(investments, "30days");
      expect(result).toHaveLength(1);
      expect(result[0]!.totalValue).toBe(1000);
      expect(result[0]!.date).toBe(createDate(5));
    });

    test("단일 계좌, 여러 기록 (시간순 정렬 확인)", () => {
      const investments: InvestmentItem[] = [
        createInvestment(1, "계좌1", [
          { daysAgo: 10, currentValue: 800, initialInvestment: 800 },
          { daysAgo: 5, currentValue: 900, initialInvestment: 800 },
          { daysAgo: 2, currentValue: 1000, initialInvestment: 800 },
        ]),
      ];

      const result = prepareInvestmentChartData(investments, "30days");
      expect(result).toHaveLength(3);
      expect(result[0]!.date).toBe(createDate(10)); // 가장 오래된 날짜가 첫 번째
      expect(result[1]!.date).toBe(createDate(5));
      expect(result[2]!.date).toBe(createDate(2)); // 가장 최근 날짜가 마지막
      expect(result[0]!.totalValue).toBe(800);
      expect(result[1]!.totalValue).toBe(900);
      expect(result[2]!.totalValue).toBe(1000);
    });
  });

  describe("여러 계좌 테스트", () => {
    test("여러 계좌, 서로 다른 날짜", () => {
      const investments: InvestmentItem[] = [
        createInvestment(1, "계좌1", [{ daysAgo: 10, currentValue: 1000, initialInvestment: 800 }]),
        createInvestment(2, "계좌2", [{ daysAgo: 5, currentValue: 2000, initialInvestment: 1500 }]),
      ];

      const result = prepareInvestmentChartData(investments, "30days");
      expect(result).toHaveLength(2);
      expect(result[0]?.totalValue).toBe(1000); // 10일 전: 계좌1(1000) + 계좌2(0, 아직 기록 없음)
      expect(result[1]?.totalValue).toBe(3000); // 5일 전: 계좌1(1000, 이전 기록 유지) + 계좌2(2000)
    });

    test("여러 계좌, 같은 날짜 (합산 확인)", () => {
      const sameDaysAgo = 5;
      const investments: InvestmentItem[] = [
        createInvestment(1, "계좌1", [
          { daysAgo: sameDaysAgo, currentValue: 1000, initialInvestment: 800 },
        ]),
        createInvestment(2, "계좌2", [
          { daysAgo: sameDaysAgo, currentValue: 2000, initialInvestment: 1500 },
        ]),
      ];

      const result = prepareInvestmentChartData(investments, "30days");
      expect(result).toHaveLength(1);
      expect(result[0]?.totalValue).toBe(3000); // 1000 + 2000
      expect(result[0]?.date).toBe(createDate(sameDaysAgo));
    });

    test("여러 계좌, 복합적인 날짜와 값", () => {
      const investments: InvestmentItem[] = [
        createInvestment(1, "계좌1", [
          { daysAgo: 15, currentValue: 500, initialInvestment: 500 },
          { daysAgo: 10, currentValue: 800, initialInvestment: 500 },
          { daysAgo: 5, currentValue: 1000, initialInvestment: 500 },
        ]),
        createInvestment(2, "계좌2", [
          { daysAgo: 12, currentValue: 1200, initialInvestment: 1000 },
          { daysAgo: 5, currentValue: 1500, initialInvestment: 1000 }, // 계좌1과 같은 날짜
        ]),
        createInvestment(3, "계좌3", [{ daysAgo: 3, currentValue: 2000, initialInvestment: 1800 }]),
      ];

      const result = prepareInvestmentChartData(investments, "30days");
      expect(result).toHaveLength(5);

      // 날짜순 정렬 확인
      expect(result[0]?.date).toBe(createDate(15));
      expect(result[1]?.date).toBe(createDate(12));
      expect(result[2]?.date).toBe(createDate(10));
      expect(result[3]?.date).toBe(createDate(5));
      expect(result[4]?.date).toBe(createDate(3));

      // 값 확인
      expect(result[0]?.totalValue).toBe(500); // 15일 전: 계좌1(500) + 계좌2(0) + 계좌3(0)
      expect(result[1]?.totalValue).toBe(1700); // 12일 전: 계좌1(500, 이전 기록 유지) + 계좌2(1200) + 계좌3(0)
      expect(result[2]?.totalValue).toBe(2000); // 10일 전: 계좌1(800) + 계좌2(1200, 이전 기록 유지) + 계좌3(0)
      expect(result[3]?.totalValue).toBe(2500); // 5일 전: 계좌1(1000) + 계좌2(1500)
      expect(result[4]?.totalValue).toBe(4500); // 3일 전: 계좌1(1000, 이전 기록 유지) + 계좌2(1500, 이전 기록 유지) + 계좌3(2000)
    });
  });

  describe("시간 범위 필터링 테스트", () => {
    test("30일 범위 필터링", () => {
      const investments: InvestmentItem[] = [
        createInvestment(1, "계좌1", [
          { daysAgo: 35, currentValue: 500, initialInvestment: 500 }, // 범위 밖
          { daysAgo: 25, currentValue: 800, initialInvestment: 500 }, // 범위 안
          { daysAgo: 5, currentValue: 1000, initialInvestment: 500 }, // 범위 안
        ]),
      ];

      const result = prepareInvestmentChartData(investments, "30days");
      expect(result).toHaveLength(2); // 35일 전 데이터는 제외
      expect(result[0]?.totalValue).toBe(800);
      expect(result[1]?.totalValue).toBe(1000);
    });

    test("3개월 범위 필터링", () => {
      const investments: InvestmentItem[] = [
        createInvestment(1, "계좌1", [
          { daysAgo: 100, currentValue: 500, initialInvestment: 500 }, // 범위 밖
          { daysAgo: 60, currentValue: 800, initialInvestment: 500 }, // 범위 안
          { daysAgo: 30, currentValue: 1000, initialInvestment: 500 }, // 범위 안
        ]),
      ];

      const result = prepareInvestmentChartData(investments, "3months");
      expect(result).toHaveLength(2); // 100일 전 데이터는 제외
      expect(result[0]?.totalValue).toBe(800);
      expect(result[1]?.totalValue).toBe(1000);
    });

    test("1년 범위 필터링", () => {
      const investments: InvestmentItem[] = [
        createInvestment(1, "계좌1", [
          { daysAgo: 400, currentValue: 500, initialInvestment: 500 }, // 범위 밖
          { daysAgo: 200, currentValue: 800, initialInvestment: 500 }, // 범위 안
          { daysAgo: 100, currentValue: 1000, initialInvestment: 500 }, // 범위 안
        ]),
      ];

      const result = prepareInvestmentChartData(investments, "1year");
      expect(result).toHaveLength(2); // 400일 전 데이터는 제외
      expect(result[0]?.totalValue).toBe(800);
      expect(result[1]?.totalValue).toBe(1000);
    });
  });

  describe("동일 날짜 중복 처리 테스트", () => {
    test("같은 계좌의 같은 날짜 기록이 여러 개 있을 때 마지막 값 사용", () => {
      const sameDaysAgo = 5;
      const sameDate = createDate(sameDaysAgo);

      const investments: InvestmentItem[] = [
        {
          id: 1,
          accountName: "계좌1",
          accountType: "주식",
          accountOwner: "본인",
          currency: "원",
          initialInvestment: 1000,
          currentValue: 1500,
          records: [
            { date: sameDate, currentValue: 1000, initialInvestment: 800 }, // 첫 번째 기록
            { date: sameDate, currentValue: 1200, initialInvestment: 800 }, // 두 번째 기록 (이걸 사용해야 함)
          ],
          note: "",
        },
      ];

      const result = prepareInvestmentChartData(investments, "30days");
      expect(result).toHaveLength(1);
      expect(result[0]?.totalValue).toBe(1200); // 마지막 값 사용
    });

    test("서로 다른 계좌의 같은 날짜 기록 합산", () => {
      const sameDaysAgo = 5;
      const sameDate = createDate(sameDaysAgo);

      const investments: InvestmentItem[] = [
        {
          id: 1,
          accountName: "계좌1",
          accountType: "주식",
          accountOwner: "본인",
          currency: "원",
          initialInvestment: 800,
          currentValue: 1000,
          records: [{ date: sameDate, currentValue: 1000, initialInvestment: 800 }],
          note: "",
        },
        {
          id: 2,
          accountName: "계좌2",
          accountType: "펀드",
          accountOwner: "본인",
          currency: "원",
          initialInvestment: 1500,
          currentValue: 2000,
          records: [{ date: sameDate, currentValue: 2000, initialInvestment: 1500 }],
          note: "",
        },
      ];

      const result = prepareInvestmentChartData(investments, "30days");
      expect(result).toHaveLength(1);
      expect(result[0]?.totalValue).toBe(3000); // 1000 + 2000
    });
  });

  describe("edge case 테스트", () => {
    test("미래 날짜가 있어도 무시되어야 함", () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);
      const futureDateString = futureDate.toISOString().split("T")[0] || "";

      const investments: InvestmentItem[] = [
        {
          id: 1,
          accountName: "계좌1",
          accountType: "주식",
          accountOwner: "본인",
          currency: "원",
          initialInvestment: 1000,
          currentValue: 1000,
          records: [
            { date: createDate(5), currentValue: 800, initialInvestment: 800 }, // 과거
            { date: futureDateString, currentValue: 1200, initialInvestment: 800 }, // 미래
          ],
          note: "",
        },
      ];

      const result = prepareInvestmentChartData(investments, "30days");
      expect(result).toHaveLength(1);
      expect(result[0]?.totalValue).toBe(800); // 미래 날짜는 무시
    });

    test("0값도 정상적으로 처리되어야 함", () => {
      const investments: InvestmentItem[] = [
        createInvestment(1, "계좌1", [{ daysAgo: 5, currentValue: 0, initialInvestment: 1000 }]),
      ];

      const result = prepareInvestmentChartData(investments, "30days");
      expect(result).toHaveLength(1);
      expect(result[0]?.totalValue).toBe(0);
    });

    test("매우 큰 값도 정상적으로 처리되어야 함", () => {
      const largeValue = 999999999999;
      const investments: InvestmentItem[] = [
        createInvestment(1, "계좌1", [
          { daysAgo: 5, currentValue: largeValue, initialInvestment: largeValue / 2 },
        ]),
      ];

      const result = prepareInvestmentChartData(investments, "30days");
      expect(result).toHaveLength(1);
      expect(result[0]?.totalValue).toBe(largeValue);
    });
  });

  describe("현실적인 시나리오 테스트", () => {
    test("계좌별로 다른 시점에 개설되어 다른 히스토리를 가진 경우", () => {
      const investments: InvestmentItem[] = [
        // 계좌1: 15일 전부터 시작
        createInvestment(1, "계좌1", [
          { daysAgo: 15, currentValue: 1000, initialInvestment: 1000 },
          { daysAgo: 10, currentValue: 1200, initialInvestment: 1000 },
          { daysAgo: 5, currentValue: 1100, initialInvestment: 1000 },
        ]),
        // 계좌2: 8일 전부터 시작
        createInvestment(2, "계좌2", [
          { daysAgo: 8, currentValue: 2000, initialInvestment: 2000 },
          { daysAgo: 5, currentValue: 2200, initialInvestment: 2000 },
        ]),
      ];

      const result = prepareInvestmentChartData(investments, "30days");
      expect(result).toHaveLength(4);

      // 15일 전: 계좌1만 존재 (계좌2는 아직 개설 안됨)
      const day15 = result.find((r) => r.date === createDate(15));
      expect(day15?.totalValue).toBe(1000);

      // 10일 전: 계좌1만 존재 (계좌2는 아직 개설 안됨)
      const day10 = result.find((r) => r.date === createDate(10));
      expect(day10?.totalValue).toBe(1200);

      // 8일 전: 계좌1(1200) + 계좌2(2000)
      const day8 = result.find((r) => r.date === createDate(8));
      expect(day8?.totalValue).toBe(3200); // 1200 + 2000

      // 5일 전: 계좌1(1100) + 계좌2(2200)
      const day5 = result.find((r) => r.date === createDate(5));
      expect(day5?.totalValue).toBe(3300); // 1100 + 2200
    });

    test("중간에 계좌 기록이 끊어진 경우", () => {
      const investments: InvestmentItem[] = [
        createInvestment(1, "계좌1", [
          { daysAgo: 20, currentValue: 1000, initialInvestment: 1000 },
          { daysAgo: 10, currentValue: 1200, initialInvestment: 1000 },
          // 5일 전에 기록이 없음 (가장 최근 값인 1200을 유지해야 함)
        ]),
        createInvestment(2, "계좌2", [{ daysAgo: 5, currentValue: 2000, initialInvestment: 2000 }]),
      ];

      const result = prepareInvestmentChartData(investments, "30days");
      expect(result).toHaveLength(3);

      // 20일 전: 계좌1만
      expect(result[0]?.totalValue).toBe(1000);

      // 10일 전: 계좌1만
      expect(result[1]?.totalValue).toBe(1200);

      // 5일 전: 계좌1(1200, 이전 값 유지) + 계좌2(2000)
      expect(result[2]?.totalValue).toBe(3200); // 1200 + 2000
    });
  });

  describe("날짜 형식 테스트", () => {
    test("dateFormatted가 올바른 한국어 형식이어야 함", () => {
      const investments: InvestmentItem[] = [
        createInvestment(1, "계좌1", [{ daysAgo: 5, currentValue: 1000, initialInvestment: 800 }]),
      ];

      const result = prepareInvestmentChartData(investments, "30days");
      expect(result[0]?.dateFormatted).toMatch(/^\d{1,2}월 \d{1,2}일$/); // "7월 15일" 형식
    });
  });
});
