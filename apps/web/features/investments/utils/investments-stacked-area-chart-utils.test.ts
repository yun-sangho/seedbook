import { InvestmentItem } from "@web/features/investments/types/types";
import { TimeRange } from "@web/types/time.consts";
import { describe, expect, test } from "vitest";
import {
  AccountChartData,
  prepareStackedAreaChartData,
} from "./investments-stacked-area-chart-utils";

describe("prepareStackedAreaChartData", () => {
  // 테스트용 날짜 생성 헬퍼
  const createDate = (daysAgo: number): string => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date.toISOString().split("T")[0] || "";
  };

  // 테스트용 투자 계좌 생성 헬퍼. id 는 숫자 편의상 number 로 받아 내부에서
  // 문자열로 변환 (InvestmentItem.id 는 UUID string).
  const createInvestment = (
    id: number,
    accountName: string,
    color: string,
    records: { daysAgo: number; currentValue: number; initialInvestment: number }[]
  ): InvestmentItem => ({
    id: String(id),
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
    holdings: [],
    cashItems: [],
    note: "",
    color,
  });

  describe("기본 기능 테스트", () => {
    test("빈 배열을 전달하면 빈 결과를 반환해야 함", () => {
      const result = prepareStackedAreaChartData([], TimeRange.ALL);
      expect(result.data).toEqual([]);
      expect(result.config).toEqual({});
    });

    test("히스토리가 없는 계좌들은 결과에서 제외되어야 함", () => {
      const investments: InvestmentItem[] = [
        createInvestment(1, "계좌1", "#3b82f6", []), // 히스토리 없음
        createInvestment(2, "계좌2", "#10b981", []), // 히스토리 없음
      ];

      const result = prepareStackedAreaChartData(investments, TimeRange.ALL);
      expect(result.data).toEqual([]);
      expect(result.config).toEqual({});
    });

    test("단일 계좌, 단일 기록", () => {
      const investments: InvestmentItem[] = [
        createInvestment(1, "계좌1", "#3b82f6", [
          { daysAgo: 5, currentValue: 1000, initialInvestment: 800 },
        ]),
      ];

      const result = prepareStackedAreaChartData(investments, TimeRange.ALL);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.date).toBe(createDate(5));
      expect(result.data[0]!.account_1).toBe(1000);

      expect(result.config).toHaveProperty("account_1");
      expect(result.config.account_1).toEqual({
        label: "계좌1",
        color: "#3b82f6",
      });
    });

    test("단일 계좌, 여러 기록 (시간순 정렬 확인)", () => {
      const investments: InvestmentItem[] = [
        createInvestment(1, "계좌1", "#3b82f6", [
          { daysAgo: 10, currentValue: 800, initialInvestment: 800 },
          { daysAgo: 5, currentValue: 900, initialInvestment: 800 },
          { daysAgo: 2, currentValue: 1000, initialInvestment: 800 },
        ]),
      ];

      const result = prepareStackedAreaChartData(investments, TimeRange.ALL);

      expect(result.data).toHaveLength(3);
      expect(result.data[0]!.date).toBe(createDate(10)); // 가장 오래된 날짜가 첫 번째
      expect(result.data[1]!.date).toBe(createDate(5));
      expect(result.data[2]!.date).toBe(createDate(2)); // 가장 최근 날짜가 마지막

      expect(result.data[0]!.account_1).toBe(800);
      expect(result.data[1]!.account_1).toBe(900);
      expect(result.data[2]!.account_1).toBe(1000);
    });
  });

  describe("여러 계좌 테스트", () => {
    test("여러 계좌, 서로 다른 날짜", () => {
      const investments: InvestmentItem[] = [
        createInvestment(1, "계좌1", "#3b82f6", [
          { daysAgo: 10, currentValue: 1000, initialInvestment: 800 },
        ]),
        createInvestment(2, "계좌2", "#10b981", [
          { daysAgo: 5, currentValue: 2000, initialInvestment: 1500 },
        ]),
      ];

      const result = prepareStackedAreaChartData(investments, TimeRange.ALL);

      expect(result.data).toHaveLength(2);

      // 10일 전: 계좌1(1000), 계좌2(0, 아직 기록 없음)
      expect(result.data[0]!.account_1).toBe(1000);
      expect(result.data[0]!.account_2).toBe(0);

      // 5일 전: 계좌1(1000, 이전 기록 유지), 계좌2(2000)
      expect(result.data[1]!.account_1).toBe(1000);
      expect(result.data[1]!.account_2).toBe(2000);

      // config 확인
      expect(result.config.account_1).toEqual({ label: "계좌1", color: "#3b82f6" });
      expect(result.config.account_2).toEqual({ label: "계좌2", color: "#10b981" });
    });

    test("여러 계좌, 같은 날짜", () => {
      const sameDaysAgo = 5;
      const investments: InvestmentItem[] = [
        createInvestment(1, "계좌1", "#3b82f6", [
          { daysAgo: sameDaysAgo, currentValue: 1000, initialInvestment: 800 },
        ]),
        createInvestment(2, "계좌2", "#10b981", [
          { daysAgo: sameDaysAgo, currentValue: 2000, initialInvestment: 1500 },
        ]),
      ];

      const result = prepareStackedAreaChartData(investments, TimeRange.ALL);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.date).toBe(createDate(sameDaysAgo));
      expect(result.data[0]!.account_1).toBe(1000);
      expect(result.data[0]!.account_2).toBe(2000);
    });

    test("여러 계좌, 복합적인 날짜와 값", () => {
      const investments: InvestmentItem[] = [
        createInvestment(1, "계좌1", "#3b82f6", [
          { daysAgo: 15, currentValue: 500, initialInvestment: 500 },
          { daysAgo: 10, currentValue: 800, initialInvestment: 500 },
          { daysAgo: 5, currentValue: 1000, initialInvestment: 500 },
        ]),
        createInvestment(2, "계좌2", "#10b981", [
          { daysAgo: 12, currentValue: 1200, initialInvestment: 1000 },
          { daysAgo: 5, currentValue: 1500, initialInvestment: 1000 }, // 계좌1과 같은 날짜
        ]),
        createInvestment(3, "계좌3", "#ef4444", [
          { daysAgo: 3, currentValue: 2000, initialInvestment: 1800 },
        ]),
      ];

      const result = prepareStackedAreaChartData(investments, TimeRange.ALL);

      expect(result.data).toHaveLength(5);

      // 날짜순 정렬 확인
      expect(result.data[0]!.date).toBe(createDate(15));
      expect(result.data[1]!.date).toBe(createDate(12));
      expect(result.data[2]!.date).toBe(createDate(10));
      expect(result.data[3]!.date).toBe(createDate(5));
      expect(result.data[4]!.date).toBe(createDate(3));

      // 15일 전: 계좌1(500), 계좌2(0), 계좌3(0)
      expect(result.data[0]!.account_1).toBe(500);
      expect(result.data[0]!.account_2).toBe(0);
      expect(result.data[0]!.account_3).toBe(0);

      // 12일 전: 계좌1(500, 이전 기록 유지), 계좌2(1200), 계좌3(0)
      expect(result.data[1]!.account_1).toBe(500);
      expect(result.data[1]!.account_2).toBe(1200);
      expect(result.data[1]!.account_3).toBe(0);

      // 10일 전: 계좌1(800), 계좌2(1200, 이전 기록 유지), 계좌3(0)
      expect(result.data[2]!.account_1).toBe(800);
      expect(result.data[2]!.account_2).toBe(1200);
      expect(result.data[2]!.account_3).toBe(0);

      // 5일 전: 계좌1(1000), 계좌2(1500), 계좌3(0)
      expect(result.data[3]!.account_1).toBe(1000);
      expect(result.data[3]!.account_2).toBe(1500);
      expect(result.data[3]!.account_3).toBe(0);

      // 3일 전: 계좌1(1000, 이전 기록 유지), 계좌2(1500, 이전 기록 유지), 계좌3(2000)
      expect(result.data[4]!.account_1).toBe(1000);
      expect(result.data[4]!.account_2).toBe(1500);
      expect(result.data[4]!.account_3).toBe(2000);
    });
  });

  describe("시간 범위 필터링 테스트", () => {
    test("1개월 범위 필터링", () => {
      const investments: InvestmentItem[] = [
        createInvestment(1, "계좌1", "#3b82f6", [
          { daysAgo: 35, currentValue: 500, initialInvestment: 500 }, // 범위 밖 (30일 초과)
          { daysAgo: 25, currentValue: 800, initialInvestment: 500 }, // 범위 안
          { daysAgo: 5, currentValue: 1000, initialInvestment: 500 }, // 범위 안
        ]),
      ];

      const result = prepareStackedAreaChartData(investments, TimeRange.ONE_MONTH);

      expect(result.data).toHaveLength(2); // 35일 전 데이터는 제외
      expect(result.data[0]!.account_1).toBe(800);
      expect(result.data[1]!.account_1).toBe(1000);
    });

    test("1개월 범위 필터링 - 여러 계좌", () => {
      const investments: InvestmentItem[] = [
        createInvestment(1, "계좌1", "#3b82f6", [
          { daysAgo: 40, currentValue: 500, initialInvestment: 500 }, // 범위 밖
          { daysAgo: 20, currentValue: 800, initialInvestment: 500 }, // 범위 안
        ]),
        createInvestment(2, "계좌2", "#10b981", [
          { daysAgo: 15, currentValue: 1500, initialInvestment: 1500 }, // 범위 안
          { daysAgo: 5, currentValue: 2000, initialInvestment: 1500 }, // 범위 안
        ]),
      ];

      const result = prepareStackedAreaChartData(investments, TimeRange.ONE_MONTH);

      expect(result.data).toHaveLength(3); // 40일 전 데이터는 제외

      // 20일 전: 계좌1(800), 계좌2(0, 아직 기록 없음)
      expect(result.data[0]!.account_1).toBe(800);
      expect(result.data[0]!.account_2).toBe(0);

      // 15일 전: 계좌1(800, 이전 기록 유지), 계좌2(1500)
      expect(result.data[1]!.account_1).toBe(800);
      expect(result.data[1]!.account_2).toBe(1500);

      // 5일 전: 계좌1(800, 이전 기록 유지), 계좌2(2000)
      expect(result.data[2]!.account_1).toBe(800);
      expect(result.data[2]!.account_2).toBe(2000);
    });

    test("3개월 범위 필터링", () => {
      const investments: InvestmentItem[] = [
        createInvestment(1, "계좌1", "#3b82f6", [
          { daysAgo: 100, currentValue: 500, initialInvestment: 500 }, // 범위 밖 (90일 초과)
          { daysAgo: 60, currentValue: 800, initialInvestment: 500 }, // 범위 안
          { daysAgo: 5, currentValue: 1000, initialInvestment: 500 }, // 범위 안
        ]),
      ];

      const result = prepareStackedAreaChartData(investments, TimeRange.THREE_MONTHS);

      expect(result.data).toHaveLength(2); // 100일 전 데이터는 제외
      expect(result.data[0]!.account_1).toBe(800);
      expect(result.data[1]!.account_1).toBe(1000);
    });

    test("1년 범위 필터링", () => {
      const investments: InvestmentItem[] = [
        createInvestment(1, "계좌1", "#3b82f6", [
          { daysAgo: 400, currentValue: 500, initialInvestment: 500 }, // 범위 밖
          { daysAgo: 200, currentValue: 800, initialInvestment: 500 }, // 범위 안
          { daysAgo: 100, currentValue: 1000, initialInvestment: 500 }, // 범위 안
        ]),
      ];

      const result = prepareStackedAreaChartData(investments, TimeRange.ONE_YEAR);

      expect(result.data).toHaveLength(2); // 400일 전 데이터는 제외
      expect(result.data[0]!.account_1).toBe(800);
      expect(result.data[1]!.account_1).toBe(1000);
    });

    test("5년 범위 필터링", () => {
      const investments: InvestmentItem[] = [
        createInvestment(1, "계좌1", "#3b82f6", [
          { daysAgo: 2000, currentValue: 500, initialInvestment: 500 }, // 범위 밖 (5년 = 1825일 초과)
          { daysAgo: 1000, currentValue: 800, initialInvestment: 500 }, // 범위 안
          { daysAgo: 100, currentValue: 1000, initialInvestment: 500 }, // 범위 안
        ]),
      ];

      const result = prepareStackedAreaChartData(investments, TimeRange.FIVE_YEARS);

      expect(result.data).toHaveLength(2); // 2000일 전 데이터는 제외
      expect(result.data[0]!.account_1).toBe(800);
      expect(result.data[1]!.account_1).toBe(1000);
    });

    test("10년 범위 필터링", () => {
      const investments: InvestmentItem[] = [
        createInvestment(1, "계좌1", "#3b82f6", [
          { daysAgo: 4000, currentValue: 500, initialInvestment: 500 }, // 범위 밖 (10년 = 3650일 초과)
          { daysAgo: 2000, currentValue: 800, initialInvestment: 500 }, // 범위 안
          { daysAgo: 100, currentValue: 1000, initialInvestment: 500 }, // 범위 안
        ]),
      ];

      const result = prepareStackedAreaChartData(investments, TimeRange.TEN_YEARS);

      expect(result.data).toHaveLength(2); // 4000일 전 데이터는 제외
      expect(result.data[0]!.account_1).toBe(800);
      expect(result.data[1]!.account_1).toBe(1000);
    });

    test("전체 범위 - 아주 오래된 데이터도 포함", () => {
      const investments: InvestmentItem[] = [
        createInvestment(1, "계좌1", "#3b82f6", [
          { daysAgo: 5000, currentValue: 500, initialInvestment: 500 }, // 범위 안 (ALL은 모두 포함)
          { daysAgo: 2000, currentValue: 800, initialInvestment: 500 }, // 범위 안
          { daysAgo: 100, currentValue: 1000, initialInvestment: 500 }, // 범위 안
        ]),
      ];

      const result = prepareStackedAreaChartData(investments, TimeRange.ALL);

      expect(result.data).toHaveLength(3); // 모든 데이터 포함
      expect(result.data[0]!.account_1).toBe(500);
      expect(result.data[1]!.account_1).toBe(800);
      expect(result.data[2]!.account_1).toBe(1000);
    });
  });

  describe("동일 날짜 중복 처리 테스트", () => {
    test("같은 계좌의 같은 날짜 기록이 여러 개 있을 때 마지막 값 사용", () => {
      const sameDaysAgo = 5;
      const sameDate = createDate(sameDaysAgo);

      const investments: InvestmentItem[] = [
        {
          id: "1",
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
          holdings: [],
          cashItems: [],
          note: "",
          color: "#3b82f6",
        },
      ];

      const result = prepareStackedAreaChartData(investments, TimeRange.ALL);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.account_1).toBe(1200); // 마지막 값 사용
    });

    test("서로 다른 계좌의 같은 날짜 기록", () => {
      const sameDaysAgo = 5;
      const sameDate = createDate(sameDaysAgo);

      const investments: InvestmentItem[] = [
        {
          id: "1",
          accountName: "계좌1",
          accountType: "주식",
          accountOwner: "본인",
          currency: "원",
          initialInvestment: 800,
          currentValue: 1000,
          records: [{ date: sameDate, currentValue: 1000, initialInvestment: 800 }],
          holdings: [],
          cashItems: [],
          note: "",
          color: "#3b82f6",
        },
        {
          id: "2",
          accountName: "계좌2",
          accountType: "펀드",
          accountOwner: "본인",
          currency: "원",
          initialInvestment: 1500,
          currentValue: 2000,
          records: [{ date: sameDate, currentValue: 2000, initialInvestment: 1500 }],
          holdings: [],
          cashItems: [],
          note: "",
          color: "#10b981",
        },
      ];

      const result = prepareStackedAreaChartData(investments, TimeRange.ALL);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.account_1).toBe(1000);
      expect(result.data[0]!.account_2).toBe(2000);
    });
  });

  describe("edge case 테스트", () => {
    test("미래 날짜가 있어도 무시되어야 함", () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);
      const futureDateString = futureDate.toISOString().split("T")[0] || "";

      const investments: InvestmentItem[] = [
        {
          id: "1",
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
          holdings: [],
          cashItems: [],
          note: "",
          color: "#3b82f6",
        },
      ];

      const result = prepareStackedAreaChartData(investments, TimeRange.ALL);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.account_1).toBe(800); // 미래 날짜는 무시
    });

    test("0값도 정상적으로 처리되어야 함", () => {
      const investments: InvestmentItem[] = [
        createInvestment(1, "계좌1", "#3b82f6", [
          { daysAgo: 5, currentValue: 0, initialInvestment: 1000 },
        ]),
      ];

      const result = prepareStackedAreaChartData(investments, TimeRange.ALL);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.account_1).toBe(0);
    });

    test("매우 큰 값도 정상적으로 처리되어야 함", () => {
      const largeValue = 999999999999;
      const investments: InvestmentItem[] = [
        createInvestment(1, "계좌1", "#3b82f6", [
          { daysAgo: 5, currentValue: largeValue, initialInvestment: largeValue / 2 },
        ]),
      ];

      const result = prepareStackedAreaChartData(investments, TimeRange.ALL);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.account_1).toBe(largeValue);
    });
  });

  describe("현실적인 시나리오 테스트", () => {
    test("계좌별로 다른 시점에 개설되어 다른 히스토리를 가진 경우", () => {
      const investments: InvestmentItem[] = [
        // 계좌1: 15일 전부터 시작
        createInvestment(1, "계좌1", "#3b82f6", [
          { daysAgo: 15, currentValue: 1000, initialInvestment: 1000 },
          { daysAgo: 10, currentValue: 1200, initialInvestment: 1000 },
          { daysAgo: 5, currentValue: 1100, initialInvestment: 1000 },
        ]),
        // 계좌2: 8일 전부터 시작
        createInvestment(2, "계좌2", "#10b981", [
          { daysAgo: 8, currentValue: 2000, initialInvestment: 2000 },
          { daysAgo: 5, currentValue: 2200, initialInvestment: 2000 },
        ]),
      ];

      const result = prepareStackedAreaChartData(investments, TimeRange.ALL);

      expect(result.data).toHaveLength(4);

      // 15일 전: 계좌1만 존재 (계좌2는 아직 개설 안됨)
      const day15 = result.data.find((r) => r.date === createDate(15));
      expect(day15?.account_1).toBe(1000);
      expect(day15?.account_2).toBe(0);

      // 10일 전: 계좌1만 존재 (계좌2는 아직 개설 안됨)
      const day10 = result.data.find((r) => r.date === createDate(10));
      expect(day10?.account_1).toBe(1200);
      expect(day10?.account_2).toBe(0);

      // 8일 전: 계좌1(1200) + 계좌2(2000)
      const day8 = result.data.find((r) => r.date === createDate(8));
      expect(day8?.account_1).toBe(1200);
      expect(day8?.account_2).toBe(2000);

      // 5일 전: 계좌1(1100) + 계좌2(2200)
      const day5 = result.data.find((r) => r.date === createDate(5));
      expect(day5?.account_1).toBe(1100);
      expect(day5?.account_2).toBe(2200);
    });

    test("중간에 계좌 기록이 끊어진 경우", () => {
      const investments: InvestmentItem[] = [
        createInvestment(1, "계좌1", "#3b82f6", [
          { daysAgo: 20, currentValue: 1000, initialInvestment: 1000 },
          { daysAgo: 10, currentValue: 1200, initialInvestment: 1000 },
          // 5일 전에 기록이 없음 (가장 최근 값인 1200을 유지해야 함)
        ]),
        createInvestment(2, "계좌2", "#10b981", [
          { daysAgo: 5, currentValue: 2000, initialInvestment: 2000 },
        ]),
      ];

      const result = prepareStackedAreaChartData(investments, TimeRange.ALL);

      expect(result.data).toHaveLength(3);

      // 20일 전: 계좌1만
      expect(result.data[0]!.account_1).toBe(1000);
      expect(result.data[0]!.account_2).toBe(0);

      // 10일 전: 계좌1만
      expect(result.data[1]!.account_1).toBe(1200);
      expect(result.data[1]!.account_2).toBe(0);

      // 5일 전: 계좌1(1200, 이전 값 유지) + 계좌2(2000)
      expect(result.data[2]!.account_1).toBe(1200);
      expect(result.data[2]!.account_2).toBe(2000);
    });
  });

  describe("날짜 형식 및 config 테스트", () => {
    test("dateFormatted가 올바른 한국어 형식이어야 함", () => {
      const investments: InvestmentItem[] = [
        createInvestment(1, "계좌1", "#3b82f6", [
          { daysAgo: 5, currentValue: 1000, initialInvestment: 800 },
        ]),
      ];

      const result = prepareStackedAreaChartData(investments, TimeRange.ALL);

      expect(result.data[0]?.dateFormatted).toMatch(/^\d{1,2}월 \d{1,2}일$/); // "7월 15일" 형식
    });

    test("config에 모든 계좌의 label과 color가 포함되어야 함", () => {
      const investments: InvestmentItem[] = [
        createInvestment(1, "계좌A", "#3b82f6", [
          { daysAgo: 5, currentValue: 1000, initialInvestment: 800 },
        ]),
        createInvestment(2, "계좌B", "#10b981", [
          { daysAgo: 5, currentValue: 2000, initialInvestment: 1500 },
        ]),
        createInvestment(3, "계좌C", "#ef4444", [
          { daysAgo: 5, currentValue: 3000, initialInvestment: 2500 },
        ]),
      ];

      const result = prepareStackedAreaChartData(investments, TimeRange.ALL);

      expect(Object.keys(result.config)).toHaveLength(3);
      expect(result.config.account_1).toEqual({ label: "계좌A", color: "#3b82f6" });
      expect(result.config.account_2).toEqual({ label: "계좌B", color: "#10b981" });
      expect(result.config.account_3).toEqual({ label: "계좌C", color: "#ef4444" });
    });

    test("account key 형식이 올바른지 확인", () => {
      const investments: InvestmentItem[] = [
        createInvestment(123, "계좌1", "#3b82f6", [
          { daysAgo: 5, currentValue: 1000, initialInvestment: 800 },
        ]),
      ];

      const result = prepareStackedAreaChartData(investments, TimeRange.ALL);

      expect(result.data[0]).toHaveProperty("account_123");
      expect(result.config).toHaveProperty("account_123");
    });
  });

  describe("데이터 포인트 타입 테스트", () => {
    test("AccountChartData 타입이 올바르게 생성되는지 확인", () => {
      const investments: InvestmentItem[] = [
        createInvestment(1, "계좌1", "#3b82f6", [
          { daysAgo: 5, currentValue: 1000, initialInvestment: 800 },
        ]),
        createInvestment(2, "계좌2", "#10b981", [
          { daysAgo: 5, currentValue: 2000, initialInvestment: 1500 },
        ]),
      ];

      const result = prepareStackedAreaChartData(investments, TimeRange.ALL);

      const dataPoint = result.data[0] as AccountChartData;

      // 필수 속성 확인
      expect(dataPoint).toHaveProperty("date");
      expect(dataPoint).toHaveProperty("dateFormatted");
      expect(typeof dataPoint.date).toBe("string");
      expect(typeof dataPoint.dateFormatted).toBe("string");

      // 동적 속성 확인
      expect(dataPoint).toHaveProperty("account_1");
      expect(dataPoint).toHaveProperty("account_2");
      expect(typeof dataPoint.account_1).toBe("number");
      expect(typeof dataPoint.account_2).toBe("number");
    });
  });
});
