import { beforeEach, describe, expect, it } from "vitest";
import { assetPlanTranslator } from "./asset-plan";
import { debtsTranslator } from "./debts";
import { investmentTranslator } from "./investment";
import { createMockPrisma } from "./mock-prisma.test-util";
import { portfolioTranslator } from "./portfolio";
import { progressTranslator } from "./progress";
import { realAssetsTranslator } from "./real-assets";
import { savingsTranslator } from "./savings";
import type { Envelope } from "./types";

/**
 * 도메인 translator round-trip 테스트.
 *
 * 패턴: write(envelope) → read() → 결과가 원본과 동일한 shape + 값인지 확인.
 * 실제 DB 대신 in-memory Prisma mock 을 사용한다.
 *
 * 이 테스트는 "브라우저 localStorage 에 있던 데이터가 DB 에 정확히 저장됐다가
 * 다시 동일한 모양으로 돌아오는가" 를 검증한다.
 */

const USER_ID = "test-user-001";

describe("investment translator round-trip", () => {
  let prisma: ReturnType<typeof createMockPrisma>["mock"];

  beforeEach(() => {
    ({ mock: prisma } = createMockPrisma());
  });

  const sampleEnvelope: Envelope = {
    state: {
      investments: [
        {
          id: "inv-uuid-1",
          accountName: "증권계좌 1",
          accountType: "증권계좌",
          currency: "KRW",
          initialInvestment: 10000000,
          currentValue: 12000000,
          note: "메모",
          color: "#3b82f6",
          records: [
            { date: "2024-06-15", initialInvestment: 10000000, currentValue: 11000000 },
            { date: "2024-07-15", initialInvestment: 10000000, currentValue: 12000000 },
          ],
          holdings: [
            {
              id: "hold-uuid-1",
              market: "KOSPI",
              ticker: "005930",
              name: "삼성전자",
              currency: "KRW",
              quantity: 10,
              memo: "",
            },
          ],
          cashItems: [{ id: "cash-uuid-1", label: "예수금", amount: 500000 }],
        },
      ],
      holdingsSortOption: "evalDesc",
    },
    version: 4,
  };

  it("write 후 read 하면 원본 envelope 과 동일한 데이터가 돌아온다", async () => {
    await investmentTranslator.write(prisma, USER_ID, sampleEnvelope);
    const result = await investmentTranslator.read(prisma, USER_ID);

    expect(result).not.toBeNull();
    expect(result!.version).toBe(4);

    const inv = (result!.state.investments as unknown[])[0] as Record<string, unknown>;
    expect(inv.id).toBe("inv-uuid-1");
    expect(inv.accountName).toBe("증권계좌 1");
    expect(inv.initialInvestment).toBe(10000000);
    expect(inv.currentValue).toBe(12000000);

    const records = inv.records as Array<Record<string, unknown>>;
    expect(records).toHaveLength(2);
    const dates = records.map((r) => r.date).sort();
    expect(dates).toEqual(["2024-06-15", "2024-07-15"]);
    const jul = records.find((r) => r.date === "2024-07-15")!;
    expect(jul.currentValue).toBe(12000000);

    const holdings = inv.holdings as Array<Record<string, unknown>>;
    expect(holdings).toHaveLength(1);
    expect(holdings[0]!.ticker).toBe("005930");

    const cashItems = inv.cashItems as Array<Record<string, unknown>>;
    expect(cashItems).toHaveLength(1);
    expect(cashItems[0]!.amount).toBe(500000);

    expect(result!.state.holdingsSortOption).toBe("evalDesc");
  });

  it("빈 envelope 을 write 하면 기존 데이터가 삭제된다", async () => {
    await investmentTranslator.write(prisma, USER_ID, sampleEnvelope);
    await investmentTranslator.write(prisma, USER_ID, { state: { investments: [] }, version: 4 });

    const result = await investmentTranslator.read(prisma, USER_ID);
    const investments = result?.state.investments as unknown[] | undefined;
    expect(investments ?? []).toHaveLength(0);
  });
});

describe("savings translator round-trip", () => {
  let prisma: ReturnType<typeof createMockPrisma>["mock"];

  beforeEach(() => {
    ({ mock: prisma } = createMockPrisma());
  });

  const sampleEnvelope: Envelope = {
    state: {
      savings: [
        {
          id: "sav-uuid-1",
          accountName: "김철수의 저축 계좌",
          accountType: "예금",
          currency: "원",
          balance: 5000000,
          interestRate: 3.5,
          note: "",
          color: "#10b981",
          records: [
            { date: "2024-06-01", balance: 4000000 },
            { date: "2024-07-01", balance: 5000000 },
          ],
        },
      ],
    },
    version: 2,
  };

  it("write 후 read 하면 원본과 동일한 저축 데이터가 돌아온다", async () => {
    await savingsTranslator.write(prisma, USER_ID, sampleEnvelope);
    const result = await savingsTranslator.read(prisma, USER_ID);

    expect(result).not.toBeNull();
    const sav = (result!.state.savings as unknown[])[0] as Record<string, unknown>;
    expect(sav.accountName).toBe("김철수의 저축 계좌");
    expect(sav.balance).toBe(5000000);
    expect(sav.interestRate).toBe(3.5);

    const records = sav.records as Array<Record<string, unknown>>;
    expect(records).toHaveLength(2);
  });
});

describe("debts translator round-trip", () => {
  let prisma: ReturnType<typeof createMockPrisma>["mock"];

  beforeEach(() => {
    ({ mock: prisma } = createMockPrisma());
  });

  const sampleEnvelope: Envelope = {
    state: {
      debts: [
        {
          id: "debt-uuid-1",
          loanName: "주택담보대출",
          loanType: "주택담보",
          lender: "KB국민은행",
          amount: 300000000,
          interestRate: 3.9,
          maturityDate: "2044-03-15",
          monthlyPayment: 1500000,
          note: "",
        },
      ],
    },
    version: 2,
  };

  it("write 후 read round-trip 이 정확하다", async () => {
    await debtsTranslator.write(prisma, USER_ID, sampleEnvelope);
    const result = await debtsTranslator.read(prisma, USER_ID);

    expect(result).not.toBeNull();
    const debt = (result!.state.debts as unknown[])[0] as Record<string, unknown>;
    expect(debt.loanName).toBe("주택담보대출");
    expect(debt.amount).toBe(300000000);
    expect(debt.maturityDate).toBe("2044-03-15");
    expect(debt.monthlyPayment).toBe(1500000);
  });
});

describe("real-assets translator round-trip", () => {
  let prisma: ReturnType<typeof createMockPrisma>["mock"];

  beforeEach(() => {
    ({ mock: prisma } = createMockPrisma());
  });

  const sampleEnvelope: Envelope = {
    state: {
      realAssets: [
        {
          id: "ra-uuid-1",
          assetName: "서울 아파트",
          assetType: "부동산",
          currentValue: 800000000,
          purchaseValue: 600000000,
          purchaseDate: "2020-05-10",
          note: "전세 끼고 매수",
          color: "#f59e0b",
        },
      ],
    },
    version: 2,
  };

  it("write 후 read round-trip 이 정확하다", async () => {
    await realAssetsTranslator.write(prisma, USER_ID, sampleEnvelope);
    const result = await realAssetsTranslator.read(prisma, USER_ID);

    expect(result).not.toBeNull();
    const asset = (result!.state.realAssets as unknown[])[0] as Record<string, unknown>;
    expect(asset.assetName).toBe("서울 아파트");
    expect(asset.currentValue).toBe(800000000);
    expect(asset.purchaseDate).toBe("2020-05-10");
  });
});

describe("asset-plan translator round-trip", () => {
  let prisma: ReturnType<typeof createMockPrisma>["mock"];

  beforeEach(() => {
    ({ mock: prisma } = createMockPrisma());
  });

  const sampleEnvelope: Envelope = {
    state: {
      plans: [
        {
          id: "plan-uuid-1",
          planName: "30년 계획",
          planPeriod: 30,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-06-01T00:00:00.000Z",
          accountPlans: {
            "inv-uuid-1": {
              contributionAmount: "1000000",
              contributionFrequency: "월",
              targetAnnualReturn: "7",
              accountKind: "investment",
            },
          },
          totalMonthlyContribution: 1000000,
          averageTargetReturn: 7,
        },
      ],
    },
    version: 2,
  };

  it("write 후 read round-trip 이 정확하다 (accountPlans 포함)", async () => {
    await assetPlanTranslator.write(prisma, USER_ID, sampleEnvelope);
    const result = await assetPlanTranslator.read(prisma, USER_ID);

    expect(result).not.toBeNull();
    const plan = (result!.state.plans as unknown[])[0] as Record<string, unknown>;
    expect(plan.planName).toBe("30년 계획");
    expect(plan.totalMonthlyContribution).toBe(1000000);

    const accountPlans = plan.accountPlans as Record<string, Record<string, unknown>>;
    expect(accountPlans["inv-uuid-1"]).toBeDefined();
    expect(accountPlans["inv-uuid-1"]!.accountKind).toBe("investment");
    expect(accountPlans["inv-uuid-1"]!.contributionAmount).toBe("1000000");
  });
});

describe("progress translator round-trip", () => {
  let prisma: ReturnType<typeof createMockPrisma>["mock"];

  beforeEach(() => {
    ({ mock: prisma } = createMockPrisma());
  });

  const sampleEnvelope: Envelope = {
    state: {
      progressPoints: [
        {
          date: "2024-06-01",
          totalAssets: 50000000,
          netAssets: 30000000,
          investments: 20000000,
          savings: 25000000,
          realAssets: 5000000,
          loans: 20000000,
        },
        {
          date: "2024-07-01",
          totalAssets: 55000000,
          netAssets: 35000000,
          investments: 22000000,
          savings: 27000000,
          realAssets: 6000000,
          loans: 20000000,
        },
      ],
    },
    version: 1,
  };

  it("write 후 read round-trip 이 정확하다", async () => {
    await progressTranslator.write(prisma, USER_ID, sampleEnvelope);
    const result = await progressTranslator.read(prisma, USER_ID);

    expect(result).not.toBeNull();
    const points = result!.state.progressPoints as Array<Record<string, unknown>>;
    expect(points).toHaveLength(2);
    expect(points[0]!.date).toBe("2024-06-01");
    expect(points[0]!.totalAssets).toBe(50000000);
    expect(points[1]!.netAssets).toBe(35000000);
  });

  it("데이터가 없으면 null 을 반환한다", async () => {
    const result = await progressTranslator.read(prisma, USER_ID);
    expect(result).toBeNull();
  });
});

describe("portfolio translator round-trip", () => {
  let prisma: ReturnType<typeof createMockPrisma>["mock"];

  beforeEach(() => {
    ({ mock: prisma } = createMockPrisma());
  });

  const sampleEnvelope: Envelope = {
    state: {
      portfolios: [
        {
          id: "port-uuid-1",
          name: "안정형",
          description: "장기 보유 위주",
          color: "#f87171",
          note: "리밸런싱: 분기 1회",
          accountIds: ["inv-uuid-a", "inv-uuid-b"],
          driftThresholdPercent: 3.5,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-04-01T00:00:00.000Z",
          allocations: [
            {
              id: "alloc-uuid-1",
              market: "KOSPI",
              ticker: "005930",
              name: "삼성전자",
              currency: "KRW",
              targetPercent: 60,
            },
            {
              id: "alloc-uuid-2",
              market: "KOSPI",
              ticker: "035720",
              name: "카카오",
              currency: "KRW",
              targetPercent: 30,
            },
          ],
        },
      ],
    },
    version: 2,
  };

  it("write 후 read 하면 원본 envelope 과 동일한 데이터가 돌아온다", async () => {
    await portfolioTranslator.write(prisma, USER_ID, sampleEnvelope);
    const result = await portfolioTranslator.read(prisma, USER_ID);

    expect(result).not.toBeNull();
    expect(result!.version).toBe(2);

    const portfolios = result!.state.portfolios as Array<Record<string, unknown>>;
    expect(portfolios).toHaveLength(1);
    const p = portfolios[0]!;
    expect(p.id).toBe("port-uuid-1");
    expect(p.name).toBe("안정형");
    expect(p.description).toBe("장기 보유 위주");
    expect(p.color).toBe("#f87171");
    expect(p.note).toBe("리밸런싱: 분기 1회");
    expect(p.accountIds).toEqual(["inv-uuid-a", "inv-uuid-b"]);
    expect(p.driftThresholdPercent).toBe(3.5);

    const allocations = p.allocations as Array<Record<string, unknown>>;
    expect(allocations).toHaveLength(2);
    const samsung = allocations.find((a) => a.ticker === "005930")!;
    expect(samsung.name).toBe("삼성전자");
    expect(samsung.targetPercent).toBe(60);
    expect(samsung.market).toBe("KOSPI");
    const kakao = allocations.find((a) => a.ticker === "035720")!;
    expect(kakao.targetPercent).toBe(30);
  });

  it("accountIds / driftThresholdPercent 가 없는 legacy payload 도 기본값으로 저장된다", async () => {
    const legacyEnvelope: Envelope = {
      state: {
        portfolios: [
          {
            id: "port-legacy",
            name: "Legacy",
            description: "",
            color: "#3b82f6",
            note: "",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            allocations: [],
          },
        ],
      },
      version: 2,
    };
    await portfolioTranslator.write(prisma, USER_ID, legacyEnvelope);
    const result = await portfolioTranslator.read(prisma, USER_ID);
    const p = (result!.state.portfolios as Array<Record<string, unknown>>)[0]!;
    expect(p.accountIds).toEqual([]);
    expect(p.driftThresholdPercent).toBe(5);
  });

  it("소수점 비중(targetPercent)도 손실 없이 round-trip 된다", async () => {
    const envelope: Envelope = {
      state: {
        portfolios: [
          {
            id: "port-decimal",
            name: "정밀 분배",
            description: "",
            color: "#3b82f6",
            note: "",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            allocations: [
              {
                id: "alloc-d-1",
                market: "KOSPI",
                ticker: "005930",
                name: "삼성전자",
                currency: "KRW",
                targetPercent: 12.5,
              },
              {
                id: "alloc-d-2",
                market: "KOSDAQ",
                ticker: "247540",
                name: "에코프로비엠",
                currency: "KRW",
                targetPercent: 87.25,
              },
            ],
          },
        ],
      },
      version: 2,
    };

    await portfolioTranslator.write(prisma, USER_ID, envelope);
    const result = await portfolioTranslator.read(prisma, USER_ID);
    const allocations = (result!.state.portfolios as Array<Record<string, unknown>>)[0]!
      .allocations as Array<Record<string, unknown>>;
    expect(allocations.find((a) => a.ticker === "005930")!.targetPercent).toBe(12.5);
    expect(allocations.find((a) => a.ticker === "247540")!.targetPercent).toBe(87.25);
  });

  it("빈 envelope 을 write 하면 기존 portfolio 가 모두 삭제된다", async () => {
    await portfolioTranslator.write(prisma, USER_ID, sampleEnvelope);
    await portfolioTranslator.write(prisma, USER_ID, { state: { portfolios: [] }, version: 2 });

    const result = await portfolioTranslator.read(prisma, USER_ID);
    const portfolios = result?.state.portfolios as unknown[] | undefined;
    expect(portfolios ?? []).toHaveLength(0);
  });

  it("portfolio 를 갱신하면 stale allocation 은 제거되고 신규 allocation 은 추가된다", async () => {
    await portfolioTranslator.write(prisma, USER_ID, sampleEnvelope);

    // 카카오 제거 + 새 종목 추가
    const updated: Envelope = {
      state: {
        portfolios: [
          {
            id: "port-uuid-1",
            name: "안정형 (개정)",
            description: "장기 보유 위주",
            color: "#f87171",
            note: "리밸런싱: 분기 1회",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-04-21T00:00:00.000Z",
            allocations: [
              {
                id: "alloc-uuid-1",
                market: "KOSPI",
                ticker: "005930",
                name: "삼성전자",
                currency: "KRW",
                targetPercent: 70,
              },
              {
                id: "alloc-uuid-3",
                market: "KOSPI",
                ticker: "000660",
                name: "SK하이닉스",
                currency: "KRW",
                targetPercent: 30,
              },
            ],
          },
        ],
      },
      version: 2,
    };

    await portfolioTranslator.write(prisma, USER_ID, updated);
    const result = await portfolioTranslator.read(prisma, USER_ID);
    const p = (result!.state.portfolios as Array<Record<string, unknown>>)[0]!;
    expect(p.name).toBe("안정형 (개정)");
    const allocations = p.allocations as Array<Record<string, unknown>>;
    expect(allocations).toHaveLength(2);
    const tickers = allocations.map((a) => a.ticker).sort();
    expect(tickers).toEqual(["000660", "005930"]);
    expect(allocations.find((a) => a.ticker === "005930")!.targetPercent).toBe(70);
  });

  it("데이터가 없으면 null 을 반환한다", async () => {
    const result = await portfolioTranslator.read(prisma, USER_ID);
    expect(result).toBeNull();
  });
});

describe("BigInt 경계값 처리", () => {
  let prisma: ReturnType<typeof createMockPrisma>["mock"];

  beforeEach(() => {
    ({ mock: prisma } = createMockPrisma());
  });

  it("큰 금액 (100억) 이 round-trip 에서 손실 없이 보존된다", async () => {
    const bigAmount = 10_000_000_000; // 100 억 원

    const envelope: Envelope = {
      state: {
        debts: [
          {
            id: "debt-big",
            loanName: "대형 대출",
            loanType: "기업",
            lender: "은행",
            amount: bigAmount,
            interestRate: 2.5,
            maturityDate: "2040-01-01",
            monthlyPayment: bigAmount / 120,
            note: "",
          },
        ],
      },
      version: 2,
    };

    await debtsTranslator.write(prisma, USER_ID, envelope);
    const result = await debtsTranslator.read(prisma, USER_ID);
    const debt = (result!.state.debts as unknown[])[0] as Record<string, unknown>;
    expect(debt.amount).toBe(bigAmount);
  });

  it("0 원 금액도 정상 round-trip 된다", async () => {
    const envelope: Envelope = {
      state: {
        investments: [
          {
            id: "inv-zero",
            accountName: "빈 계좌",
            accountType: "증권",
            currency: "KRW",
            initialInvestment: 0,
            currentValue: 0,
            note: "",
            color: "#000",
            records: [],
            holdings: [],
            cashItems: [],
          },
        ],
        holdingsSortOption: "default",
      },
      version: 4,
    };

    await investmentTranslator.write(prisma, USER_ID, envelope);
    const result = await investmentTranslator.read(prisma, USER_ID);
    const inv = (result!.state.investments as unknown[])[0] as Record<string, unknown>;
    expect(inv.initialInvestment).toBe(0);
    expect(inv.currentValue).toBe(0);
  });
});
