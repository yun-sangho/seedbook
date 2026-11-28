import { usePortfolioStore } from "@mobile/features/portfolio/stores/portfolio-store";
import {
  __resetAccountForTests,
  accountStorage,
  activateAccount,
} from "@mobile/lib/account-storage";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ONBOARDING_PROGRESS_KEY } from "../utils/onboarding-flow";
import { OnboardingGate } from "./onboarding-gate";

const { updateUser, session } = vi.hoisted(() => ({
  updateUser: vi.fn(),
  session: { user: { id: "u-1", name: "사용자", image: null as string | null } },
}));
vi.mock("@mobile/lib/auth-client", () => ({
  authClient: { updateUser },
  useSession: () => ({ data: session, isPending: false }),
}));
vi.mock("@mobile/lib/storage-migration", () => ({
  uploadAllToCloud: vi.fn(async () => undefined),
  downloadAllFromCloud: vi.fn(async () => undefined),
}));
// three 는 jsdom 에서 그릴 수 없다.
vi.mock("@mobile/features/garden/components/garden-canvas", () => ({
  GardenCanvas: () => <div data-testid="garden" />,
}));

const puts: unknown[] = [];
let status: () => Response;
const server = (chosen: boolean, inUse: boolean) => () =>
  Response.json({ storageMode: "local", chosen, inUse });

beforeEach(async () => {
  localStorage.clear();
  __resetAccountForTests();
  await activateAccount("u-1");
  usePortfolioStore.setState({ portfolios: [] });
  puts.length = 0;
  status = server(false, false);
  session.user.image = null;
  updateUser.mockReset().mockResolvedValue({ data: {} });
  vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
    if ((init?.method ?? "GET") === "GET") return status();
    puts.push(JSON.parse(String(init?.body)));
    return Response.json({ ok: true });
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function open() {
  await act(async () => {
    render(
      <OnboardingGate>
        <div>앱 콘텐츠</div>
      </OnboardingGate>
    );
  });
}
const app = () => screen.queryByText("앱 콘텐츠");
const heading = () => screen.getByRole("heading", { level: 1 }).textContent;
const click = async (name: string | RegExp) => {
  await act(async () => fireEvent.click(screen.getByRole("button", { name })));
};
const portfolios = () => usePortfolioStore.getState().portfolios;

describe("OnboardingGate", () => {
  describe("existing users never see the onboarding again", () => {
    it("opens the app when storage was already chosen", async () => {
      session.user.image = "seed:sprout-2-mint";
      status = server(true, true);
      await open();
      expect(app()).toBeInTheDocument();
    });

    it("only asks for storage when an existing user has not chosen yet", async () => {
      session.user.image = "seed:sprout-2-mint";
      status = server(false, true);
      await open();
      expect(heading()).toBe("저장 방식을 확인해 주세요");
    });

    it("forgets leftover onboarding progress", async () => {
      accountStorage.setItem(ONBOARDING_PROGRESS_KEY, '{"step":"storage","portfolioId":null}');
      status = server(true, true);
      await open();
      expect(accountStorage.getItem(ONBOARDING_PROGRESS_KEY)).toBeNull();
    });
  });

  describe("new user", () => {
    it("starts with the nickname", async () => {
      await open();
      expect(heading()).toBe("어떻게 불러 드릴까요?");
      expect(app()).toBeNull();
    });

    it("saves the suggested nickname and a seed avatar when the nickname is skipped", async () => {
      await open();
      const suggested = (screen.getByRole("textbox", { name: /닉네임/ }) as HTMLInputElement).value;
      fireEvent.change(screen.getByRole("textbox", { name: /닉네임/ }), {
        target: { value: "x" },
      });
      await click("나중에 하기");
      expect(updateUser).toHaveBeenCalledWith({
        name: suggested,
        image: expect.stringMatching(/^seed:/),
      });
      expect(heading()).toBe("첫 씨앗을 골라 주세요");
    });

    it("skipping the seed and storage saves local storage and opens the app without a portfolio", async () => {
      session.user.image = "seed:sprout-2-mint";
      await open();
      expect(heading()).toBe("첫 씨앗을 골라 주세요");
      await click("나중에 하기");
      expect(heading()).toBe("어디에 저장할까요?");
      await click(/나중에 하기/);
      expect(puts).toEqual([{ storageMode: "local", onlyIfUnchosen: true }]);
      expect(app()).toBeInTheDocument();
      expect(portfolios()).toEqual([]);
      expect(accountStorage.getItem(ONBOARDING_PROGRESS_KEY)).toBeNull();
    });

    it("skipping the goal plants the card as a seed and remembers to resume at storage", async () => {
      session.user.image = "seed:sprout-2-mint";
      await open();
      fireEvent.click(screen.getByRole("radio", { name: /올웨더/ }));
      await click("이 씨앗으로 시작");
      expect(screen.getByRole("textbox", { name: "이름" })).toHaveValue("올웨더");
      await click("나중에 하기");
      expect(portfolios()).toMatchObject([
        { name: "올웨더", goalAmount: null, growthStage: 0, allocations: [] },
      ]);
      expect(heading()).toBe("어디에 저장할까요?");
      expect(JSON.parse(accountStorage.getItem(ONBOARDING_PROGRESS_KEY) ?? "null")).toEqual({
        step: "storage",
        portfolioId: portfolios()[0]?.id,
        presetId: "all-weather",
      });
    });

    it("plants a card with a goal and picked stocks, then opens the app", async () => {
      session.user.image = "seed:sprout-2-mint";
      await open();
      fireEvent.click(screen.getByRole("radio", { name: /미국 지수/ }));
      await click("이 씨앗으로 시작");
      fireEvent.change(screen.getByRole("textbox", { name: "첫 목표 금액" }), {
        target: { value: "10000000" },
      });
      await click("다음");

      expect(heading()).toBe("자산군마다 종목을 담아 주세요");
      expect(screen.getByRole("button", { name: "씨앗 심기" })).toBeDisabled();
      await click(/TIGER 미국S&P500/);
      await click(/KODEX 미국S&P500/);
      await click(/TIGER 미국나스닥100/);
      await click("씨앗 심기");

      expect(portfolios()).toHaveLength(1);
      expect(portfolios()[0]).toMatchObject({ name: "미국 지수", goalAmount: 10_000_000 });
      expect(portfolios()[0]?.allocations.map((a) => [a.name, a.targetPercent])).toEqual([
        ["TIGER 미국S&P500", 25],
        ["KODEX 미국S&P500", 25],
        ["TIGER 미국나스닥100", 50],
      ]);

      expect(heading()).toMatch(/씨앗을/);
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 800));
      });
      expect(heading()).toBe("'미국 지수' 씨앗을 심었어요");
      await click("다음");

      fireEvent.click(screen.getByRole("radio", { name: /이 기기에만 저장/ }));
      await click("이대로 시작하기");
      expect(app()).toBeInTheDocument();
      expect(window.location.pathname).toBe("/assets");
    });

    it("resumes at the saved step for the portfolio it planted", async () => {
      session.user.image = "seed:sprout-2-mint";
      const id = usePortfolioStore.getState().addPortfolio("영구 포트폴리오");
      accountStorage.setItem(
        ONBOARDING_PROGRESS_KEY,
        JSON.stringify({ step: "stocks", portfolioId: id, presetId: "permanent" })
      );
      await open();
      expect(heading()).toBe("자산군마다 종목을 담아 주세요");
      expect(screen.getByRole("region", { name: "현금성" })).toBeInTheDocument();
    });
  });
});
