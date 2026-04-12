import { beforeEach, describe, expect, it } from "vitest";

/**
 * `upgradeLocalIdsIfNeeded` 가 레거시 number ID envelope 를 UUID 로 올리면서
 * asset-plan 의 cross-store 참조까지 다시 연결하는지 확인한다.
 *
 * 모듈 import 시 IIFE 가 실행되므로 각 테스트에서 `vi.resetModules()` + 재 import
 * 패턴을 써 한 번만 실행되는 side-effect 를 반복 호출한다.
 */

const STORE_KEYS = [
  "investment-storage",
  "savings-storage",
  "debts-storage",
  "real-assets-storage",
  "asset-plan-storage",
] as const;

async function freshImport() {
  // 매 테스트마다 모듈 캐시를 지우고 다시 import 해 bootstrap IIFE 를 재실행한다.
  await import("vitest").then(({ vi }) => vi.resetModules());
  await import("./local-id-upgrade");
}

function clearStorage() {
  for (const key of STORE_KEYS) {
    window.localStorage.removeItem(key);
  }
  window.localStorage.removeItem("seedbook.localIdUpgraded.v1");
}

describe("upgradeLocalIdsIfNeeded", () => {
  beforeEach(() => clearStorage());

  it("legacy investment envelope 의 number ID 가 UUID 로 교체된다", async () => {
    window.localStorage.setItem(
      "investment-storage",
      JSON.stringify({
        state: {
          investments: [
            {
              id: 2,
              accountName: "A",
              accountType: "x",
              accountOwner: "y",
              currency: "KRW",
              initialInvestment: 0,
              currentValue: 0,
              records: [],
              holdings: [{ id: 5, market: "", ticker: "", name: "", currency: "", quantity: 0, memo: "" }],
              cashItems: [{ id: 1, label: "예수금", amount: 0 }],
              note: "",
              color: "#000",
            },
          ],
          lastInvestmentId: 3,
        },
        version: 3,
      })
    );

    await freshImport();

    const upgraded = JSON.parse(window.localStorage.getItem("investment-storage")!);
    const inv = upgraded.state.investments[0];
    expect(typeof inv.id).toBe("string");
    expect(inv.id).not.toBe("2");
    expect(typeof inv.holdings[0].id).toBe("string");
    expect(typeof inv.cashItems[0].id).toBe("string");
    expect("lastInvestmentId" in upgraded.state).toBe(false);
    expect(upgraded.version).toBe(4);
  });

  it("asset-plan 의 accountPlans 숫자 키가 새 UUID 로 교체되고 accountKind 가 주입된다", async () => {
    // investment 하나 (id 2) + savings 하나 (id 7) 를 먼저 저장
    window.localStorage.setItem(
      "investment-storage",
      JSON.stringify({
        state: {
          investments: [
            {
              id: 2,
              accountName: "inv",
              accountType: "x",
              accountOwner: "y",
              currency: "KRW",
              initialInvestment: 0,
              currentValue: 0,
              records: [],
              holdings: [],
              cashItems: [],
              note: "",
              color: "#000",
            },
          ],
          lastInvestmentId: 2,
        },
        version: 3,
      })
    );
    window.localStorage.setItem(
      "savings-storage",
      JSON.stringify({
        state: {
          savings: [
            {
              id: 7,
              accountName: "sav",
              accountType: "x",
              accountOwner: "y",
              currency: "KRW",
              balance: 0,
              records: [],
              note: "",
              color: "#000",
            },
          ],
          lastSavingsId: 7,
        },
        version: 1,
      })
    );
    window.localStorage.setItem(
      "asset-plan-storage",
      JSON.stringify({
        state: {
          plans: [
            {
              id: "plan_xyz",
              planName: "p",
              planPeriod: 30,
              accountPlans: {
                "2": { contributionAmount: "100", contributionFrequency: "월", targetAnnualReturn: "5" },
                "7": { contributionAmount: "50", contributionFrequency: "월", targetAnnualReturn: "3" },
              },
              totalMonthlyContribution: 150,
              averageTargetReturn: 4,
              createdAt: "2024-01-01T00:00:00.000Z",
              updatedAt: "2024-01-01T00:00:00.000Z",
            },
          ],
        },
        version: 1,
      })
    );

    await freshImport();

    const invEnv = JSON.parse(window.localStorage.getItem("investment-storage")!);
    const savEnv = JSON.parse(window.localStorage.getItem("savings-storage")!);
    const planEnv = JSON.parse(window.localStorage.getItem("asset-plan-storage")!);

    const newInvId = invEnv.state.investments[0].id as string;
    const newSavId = savEnv.state.savings[0].id as string;

    const plan = planEnv.state.plans[0];
    // 원래 "2", "7" 키가 각각 새 UUID 로 교체되어야 한다
    expect(Object.keys(plan.accountPlans).sort()).toEqual([newInvId, newSavId].sort());
    expect(plan.accountPlans[newInvId].accountKind).toBe("investment");
    expect(plan.accountPlans[newSavId].accountKind).toBe("savings");
  });

  it("업그레이드 플래그가 있으면 다시 실행되지 않는다", async () => {
    // 마커만 설정하고 데이터를 넣지 않음
    window.localStorage.setItem("seedbook.localIdUpgraded.v1", "1");
    window.localStorage.setItem(
      "investment-storage",
      JSON.stringify({
        state: { investments: [{ id: 2, holdings: [], cashItems: [] }], lastInvestmentId: 2 },
        version: 3,
      })
    );

    await freshImport();

    // 플래그가 이미 있었으므로 업그레이드 건너뛰고 원본 그대로 남는다
    const env = JSON.parse(window.localStorage.getItem("investment-storage")!);
    expect(env.state.investments[0].id).toBe(2);
    expect(env.state.lastInvestmentId).toBe(2);
  });

  it("빈 localStorage 에서도 예외 없이 플래그만 설정한다", async () => {
    expect(() => window.localStorage.getItem("seedbook.localIdUpgraded.v1")).not.toThrow();
    await freshImport();
    expect(window.localStorage.getItem("seedbook.localIdUpgraded.v1")).toBe("1");
  });
});
