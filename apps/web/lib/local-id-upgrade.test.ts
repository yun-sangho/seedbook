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
              currency: "KRW",
              initialInvestment: 0,
              currentValue: 0,
              records: [],
              holdings: [
                { id: 5, market: "", ticker: "", name: "", currency: "", quantity: 0, memo: "" },
              ],
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
