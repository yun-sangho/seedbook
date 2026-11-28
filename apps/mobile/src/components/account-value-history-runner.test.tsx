import { useInvestmentStore } from "@mobile/features/investments/stores/investment-store";
import { readHoldingsHistory } from "@mobile/features/investments/utils/account-value-history-storage";
import {
  __resetAccountForTests,
  accountStorage,
  activateAccount,
} from "@mobile/lib/account-storage";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountValueHistoryRunner } from "./account-value-history-runner";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";

function setHoldings(quantity: number) {
  useInvestmentStore.setState({
    investments: [
      {
        id: ACCOUNT,
        accountName: "계좌",
        accountType: "일반",
        currency: "KRW",
        initialInvestment: 0,
        currentValue: 0,
        records: [],
        holdings: [
          {
            id: "h",
            market: "KOSPI",
            ticker: "005930",
            name: "삼성전자",
            currency: "KRW",
            quantity,
            memo: "",
          },
        ],
        cashItems: [{ id: "c", label: "예수금", amount: 1_000 }],
        note: "",
        color: "#000000",
      },
    ],
  });
}

/** 기록·채우기는 비동기 대기열로 돈다 — 끝날 때까지 기다린다. */
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

beforeEach(async () => {
  window.localStorage.clear();
  __resetAccountForTests();
  await activateAccount("user-1");
  // 채우기는 종가를 받으러 가지 않는다 (이력이 오늘 시작해 빠진 날이 없다).
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("AccountValueHistoryRunner", () => {
  it("records the holdings when the app opens in local mode", async () => {
    setHoldings(3);

    render(<AccountValueHistoryRunner />);
    await settle();

    const history = await readHoldingsHistory();
    expect(history).toHaveLength(1);
    expect(history[0]!.accounts?.[ACCOUNT]?.holdings).toEqual([
      { market: "KOSPI", ticker: "005930", quantity: 3 },
    ]);
  });

  it("records a holdings change a moment after it stops changing", async () => {
    setHoldings(3);
    render(<AccountValueHistoryRunner />);
    await settle();
    vi.useFakeTimers();

    act(() => setHoldings(4));
    act(() => setHoldings(5));
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    vi.useRealTimers();
    await settle();

    const history = await readHoldingsHistory();
    expect(history.at(-1)!.accounts?.[ACCOUNT]?.holdings[0]?.quantity).toBe(5);
  });

  it("only marks the history as stopped in cloud mode", async () => {
    setHoldings(3);
    render(<AccountValueHistoryRunner />);
    await settle();
    accountStorage.setItem("seedbook.storageMode", "cloud");

    render(<AccountValueHistoryRunner />);
    await settle();

    expect((await readHoldingsHistory()).at(-1)!.accounts).toBe(null);
    expect(fetch).not.toHaveBeenCalled();
  });
});
