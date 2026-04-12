import { describe, expect, it, beforeEach } from "vitest";
import { createMockPrisma } from "./mock-prisma.test-util";
import { investmentTranslator } from "./investment";
import { savingsTranslator } from "./savings";
import { debtsTranslator } from "./debts";
import { realAssetsTranslator } from "./real-assets";
import { assetPlanTranslator } from "./asset-plan";
import { progressTranslator } from "./progress";
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
          accountName: "홍길동의 증권계좌",
          accountType: "증권계좌",
          accountOwner: "홍길동",
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
          cashItems: [
            { id: "cash-uuid-1", label: "예수금", amount: 500000 },
          ],
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
    expect(inv.accountName).toBe("홍길동의 증권계좌");
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
          accountOwner: "김철수",
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
          loanOwner: "본인",
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
          assetOwner: "본인",
          currentValue: 800000000,
          purchaseValue: 600000000,
          purchaseDate: "2020-05-10",
          note: "전세 끼고 매수",
          color: "#f59e0b",
        },
      ],
      customOwners: ["본인", "배우자"],
    },
    version: 2,
  };

  it("write 후 read round-trip 이 정확하다 (customOwners 포함)", async () => {
    await realAssetsTranslator.write(prisma, USER_ID, sampleEnvelope);
    const result = await realAssetsTranslator.read(prisma, USER_ID);

    expect(result).not.toBeNull();
    const asset = (result!.state.realAssets as unknown[])[0] as Record<string, unknown>;
    expect(asset.assetName).toBe("서울 아파트");
    expect(asset.currentValue).toBe(800000000);
    expect(asset.purchaseDate).toBe("2020-05-10");

    const owners = result!.state.customOwners as string[];
    expect(owners).toEqual(expect.arrayContaining(["본인", "배우자"]));
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
            loanOwner: "본인",
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
            accountOwner: "본인",
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
