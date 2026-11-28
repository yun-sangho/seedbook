import { useEffect } from "react";
import type { Stack as StackView } from "@mobile/app/_stack/stackflow";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/** 화면이 보이는(effect 가 도는) 탭. */
const live = vi.hoisted(() => new Set<string>());

/** 탭 화면 대역: 입력 하나와, 화면이 살아 있는 동안만 도는 구독 하나를 가진다. */
function FakeTab({ name }: { name: string }) {
  useEffect(() => {
    live.add(name);
    return () => {
      live.delete(name);
    };
  }, [name]);
  return <input aria-label={name} />;
}
vi.mock("../home/_components/home-mobile", () => ({ HomeMobile: () => <FakeTab name="home" /> }));
vi.mock("../accounts/_components/investment-mobile", () => ({
  InvestmentMobile: () => <FakeTab name="investments" />,
}));
vi.mock("../rebalancing/_components/rebalancing-home-mobile", () => ({
  RebalancingHomeMobile: () => <FakeTab name="rebalancing" />,
}));
vi.mock("../portfolios/_components/portfolio-list-mobile", () => ({
  PortfolioListMobile: () => <FakeTab name="portfolio" />,
}));
vi.mock("../settings/_components/settings-menu-mobile", () => ({
  SettingsMenuMobile: () => <p>설정 화면</p>,
}));
vi.mock("../settings/_components/storage-mode-mobile", () => ({
  StorageModeMobile: () => <p>저장 위치 화면</p>,
}));
vi.mock("../settings/_components/data-backup-mobile", () => ({
  DataBackupMobile: () => <p>백업 화면</p>,
}));
vi.mock("../settings/_components/delete-account-mobile", () => ({
  DeleteAccountMobile: () => <p>탈퇴 화면</p>,
}));
vi.mock("@mobile/components/legal-document-view", () => ({
  LegalDocumentView: ({ document, version }: { document: string; version?: string }) => (
    <p>
      {document} 문서 {version ?? "현재"}
    </p>
  ),
}));
vi.mock("../accounts/[id]/_components/account-detail-mobile", () => ({
  AccountDetailMobile: ({ id }: { id: string }) => <p>계좌 {id}</p>,
}));
vi.mock("@mobile/components/mobile/profile-menu", () => ({
  ProfileButton: ({ onClick }: { onClick: () => void }) => (
    <button type="button" onClick={onClick}>
      내 프로필
    </button>
  ),
  ProfileEditor: () => <p>프로필 편집</p>,
  useSessionUser: () => undefined,
}));

// jsdom 에는 Web Animations 가 없다.
Element.prototype.animate = () =>
  ({ finished: Promise.resolve(), cancel: () => {}, finish: () => {} }) as unknown as Animation;

// `resetModules` 뒤에도 SEED 는 실제 모듈을 한 번만 쓴다 (mock 결과는 초기화되지 않는다). 그러지 않으면
// 테스트마다 앱과 무관한 모듈 수백 개를 다시 불러와, CPU 가 바쁠 때 제한 시간을 넘긴다.
vi.mock("@seed-design/react", (importOriginal) => importOriginal());

// `open` 이 테스트마다 다시 불러올 모듈을 미리 한 번 불러 둔다. 그러지 않으면 화면 전체의 첫 로딩이 첫
// 테스트의 5초 제한 안에서 돌아, CPU 가 바쁠 때 시간을 넘긴다. 시간을 넘긴 테스트는 뒤에서 이어져
// 다음 테스트와 겹치고, 나머지 테스트도 함께 실패한다.
await import("./stackflow");
await import("./stack-control");

type Modules = {
  Stack: typeof StackView;
  control: typeof import("./stack-control");
  actions: typeof import("./stackflow")["actions"];
};

const tick = (ms = 0) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));
/** 화면 전환(350ms)이 끝날 때까지. */
const settle = () => tick(500);

/** 스택은 모듈에 하나뿐이라 테스트마다 모듈을 새로 불러온다 (새로고침과 같다). */
async function open(path: string): Promise<Modules> {
  vi.resetModules();
  window.history.replaceState(null, "", path);
  const { Stack, actions } = await import("./stackflow");
  const control = await import("./stack-control");
  render(<Stack initialContext={{ theme: "cupertino" }} />);
  await settle();
  return { Stack, control, actions };
}

const tabButton = (name: string) => screen.getByRole("button", { name });
const visibleInput = (name: string) => screen.queryByRole("textbox", { name });

afterEach(() => live.clear());

describe("switching tabs", () => {
  it("keeps what was typed on a tab while another tab is shown", async () => {
    await open("/assets/investments");
    fireEvent.change(screen.getByLabelText("investments"), { target: { value: "메모" } });
    const before = screen.getByLabelText("investments");

    fireEvent.click(tabButton("리밸런싱"));
    await tick();
    expect(visibleInput("investments")).toBeNull();
    fireEvent.click(tabButton("계좌"));
    await tick();

    expect(screen.getByLabelText("investments")).toBe(before);
    expect((visibleInput("investments") as HTMLInputElement).value).toBe("메모");
  });

  it("stops the effects of hidden tabs and starts them again when shown", async () => {
    await open("/assets");
    fireEvent.click(tabButton("포트폴리오"));
    await tick();
    expect([...live]).toEqual(["portfolio"]);

    fireEvent.click(tabButton("홈"));
    await tick();
    expect([...live]).toEqual(["home"]);
  });

  it("does not build a tab until it is opened", async () => {
    await open("/assets");

    expect(screen.queryByLabelText("portfolio")).toBeNull();
  });

  it("marks the tab, title and address of the shown tab without adding browser history", async () => {
    await open("/assets");
    const length = window.history.length;

    fireEvent.click(tabButton("포트폴리오"));
    await tick();

    expect(screen.getByRole("button", { current: "page" }).textContent).toBe("포트폴리오");
    expect(window.location.pathname).toBe("/assets/portfolio/");
    expect(window.history.length).toBe(length);
  });
});

describe("tab bar", () => {
  it("lists the four tabs without a 더보기 item", async () => {
    await open("/assets");

    const nav = screen.getByRole("navigation", { name: "주 메뉴" });
    const labels = [...nav.querySelectorAll("button")].map((button) => button.textContent);
    expect(labels).toEqual(["홈", "계좌", "리밸런싱", "포트폴리오"]);
  });
});

describe("settings entry points", () => {
  it("opens the settings menu from the app bar profile button and goes back to the tab", async () => {
    const { actions } = await open("/assets/portfolio");

    fireEvent.click(screen.getByRole("button", { name: "내 프로필" }));
    await settle();
    expect(screen.queryByText("설정 화면")).not.toBeNull();
    expect(screen.queryByText("프로필 편집")).toBeNull();
    expect(window.location.pathname).toBe("/assets/settings/");

    act(() => actions.pop());
    await settle();
    expect(screen.queryByText("설정 화면")).toBeNull();
    expect(window.location.pathname).toBe("/assets/portfolio/");
  });

  it.each([
    ["/assets/settings/profile", "프로필 편집"],
    ["/assets/settings/storage", "저장 위치 화면"],
    ["/assets/settings/data", "백업 화면"],
    ["/assets/settings/delete-account", "탈퇴 화면"],
    ["/assets/settings/terms", "terms 문서 현재"],
    ["/assets/settings/privacy", "privacy 문서 현재"],
    ["/assets/settings/terms/2026-11-25", "terms 문서 2026-11-25"],
  ])("puts the settings menu under %s", async (path, text) => {
    const { actions } = await open(path);
    expect(screen.queryByText(text)).not.toBeNull();

    act(() => actions.pop());
    await settle();

    expect(window.location.pathname).toBe("/assets/settings/");
  });
});

describe("opening an address", () => {
  it.each([
    ["/assets", "home"],
    ["/assets/", "home"],
    ["/assets/investments", "investments"],
    ["/assets/rebalancing", "rebalancing"],
    ["/assets/portfolio/", "portfolio"],
    ["/assets/unknown", "home"],
    ["/somewhere/else", "home"],
  ])("%s shows the %s tab", async (path, tab) => {
    await open(path);

    expect(visibleInput(tab)).not.toBeNull();
    expect(live.size).toBe(1);
  });

  it("opens settings, not a tab, on /assets/settings", async () => {
    await open("/assets/settings");

    expect(screen.queryByText("설정 화면")).not.toBeNull();
    expect(window.location.pathname).toBe("/assets/settings/");
  });

  it("puts the matching tab under a detail", async () => {
    const { actions } = await open("/assets/investments/a1");
    expect(screen.queryByText("계좌 a1")).not.toBeNull();

    act(() => actions.pop());
    await settle();

    expect(visibleInput("investments")).not.toBeNull();
    expect(window.location.pathname).toBe("/assets/investments/");
  });
});

describe("stack control", () => {
  it("switches the root tab from a pushed screen by going back to the root", async () => {
    const { actions, control } = await open("/assets");
    act(() => actions.push("AccountDetail", { id: "a1" }));
    await settle();

    act(() => control.switchTab("portfolio"));
    await settle();

    expect(screen.queryByText("계좌 a1")).toBeNull();
    expect(visibleInput("portfolio")).not.toBeNull();
    expect(screen.getByRole("button", { current: "page" }).textContent).toBe("포트폴리오");
    expect(window.location.pathname).toBe("/assets/portfolio/");
  });

  it("goes back one screen, and reports when already at the root", async () => {
    const { actions, control } = await open("/assets");
    act(() => actions.push("AccountDetail", { id: "a1" }));
    await settle();

    let first = false;
    act(() => {
      first = control.goBack();
    });
    await settle();

    expect(first).toBe(true);
    expect(visibleInput("home")).not.toBeNull();
    expect(control.goBack()).toBe(false);
  });

  it("lets the root screen undo its own state on back before reporting the root", async () => {
    const { control } = await open("/assets");
    let focused = true;
    const release = control.setRootBack(() => {
      if (!focused) return false;
      focused = false;
      return true;
    });

    expect(control.goBack()).toBe(true);
    expect(focused).toBe(false);
    expect(control.goBack()).toBe(false);
    release();
  });

  it("pops a pushed screen before asking the root screen", async () => {
    const { actions, control } = await open("/assets");
    const rootBack = vi.fn(() => true);
    const release = control.setRootBack(rootBack);
    act(() => actions.push("AccountDetail", { id: "a1" }));
    await settle();

    act(() => {
      control.goBack();
    });
    await settle();

    expect(rootBack).not.toHaveBeenCalled();
    expect(visibleInput("home")).not.toBeNull();
    release();
    expect(control.goBack()).toBe(false);
  });

  it("returns to the home tab when another account signs in", async () => {
    const { actions, control } = await open("/assets/investments");
    control.bindStackToAccount("user-a");
    act(() => actions.push("AccountDetail", { id: "a1" }));
    await settle();

    expect(control.isStackOfOtherAccount("user-b")).toBe(true);
    act(() => control.bindStackToAccount("user-b"));
    await settle();

    expect(screen.queryByText("계좌 a1")).toBeNull();
    expect(visibleInput("home")).not.toBeNull();
    expect(window.location.pathname).toBe("/assets/");
  });

  it("keeps the screen when the same account comes back", async () => {
    const { actions, control } = await open("/assets/investments");
    control.bindStackToAccount("user-a");
    act(() => actions.push("AccountDetail", { id: "a1" }));
    await settle();

    expect(control.isStackOfOtherAccount("user-a")).toBe(false);
    act(() => control.bindStackToAccount("user-a"));
    await settle();

    expect(screen.queryByText("계좌 a1")).not.toBeNull();
  });
});
