import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LAST_LOGIN_METHOD_KEY } from "@web/lib/last-login-method";
import type { LinkResultParams } from "@web/lib/login-methods";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginMethodsMobile } from "./login-methods-mobile";

// 외부 경계(better-auth 클라이언트, /api/auth-providers)만 모킹한다.
const mockListAccounts = vi.fn();
const mockLinkSocial = vi.fn();
const mockUnlinkAccount = vi.fn();
vi.mock("@web/lib/auth-client", () => ({
  authClient: {
    listAccounts: () => mockListAccounts(),
    linkSocial: (opts: unknown) => mockLinkSocial(opts),
    unlinkAccount: (opts: unknown) => mockUnlinkAccount(opts),
    signOut: vi.fn(),
  },
}));

const KAKAO = { id: "acc-k", providerId: "kakao", accountId: "1" };
const APPLE = { id: "acc-a", providerId: "apple", accountId: "001.x" };

function stubProviders({ apple }: { apple: boolean }) {
  vi.stubGlobal("fetch", async (url: string) =>
    url === "/api/auth-providers" ? Response.json({ apple }) : new Response(null, { status: 503 })
  );
}

const onReturnParamsShown = vi.fn();

function open(returnParams: LinkResultParams = {}) {
  render(
    <LoginMethodsMobile returnParams={returnParams} onReturnParamsShown={onReturnParamsShown} />
  );
}

describe("LoginMethodsMobile", () => {
  beforeEach(() => {
    mockListAccounts.mockReset();
    mockLinkSocial.mockReset();
    mockUnlinkAccount.mockReset();
    onReturnParamsShown.mockReset();
    mockLinkSocial.mockResolvedValue({ data: { url: "https://kauth.kakao.com" }, error: null });
    window.localStorage.clear();
    stubProviders({ apple: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows which methods are linked and offers to link apple", async () => {
    mockListAccounts.mockResolvedValue({ data: [KAKAO], error: null });
    open();

    expect(await screen.findByRole("button", { name: "Apple 연결" })).toBeInTheDocument();
    expect(screen.getByText(/하나뿐인 로그인 수단은 해제할 수 없어요/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "카카오 연결 해제" })).not.toBeInTheDocument();
  });

  it("hides apple when it is not set up on the server", async () => {
    stubProviders({ apple: false });
    mockListAccounts.mockResolvedValue({ data: [KAKAO], error: null });
    open();

    expect(await screen.findByText("카카오")).toBeInTheDocument();
    await act(async () => {});
    expect(screen.queryByText("Apple")).not.toBeInTheDocument();
  });

  it("links apple and returns to this screen whether it works or not", async () => {
    mockListAccounts.mockResolvedValue({ data: [KAKAO], error: null });
    open();

    const linkApple = await screen.findByRole("button", { name: "Apple 연결" });
    await act(async () => fireEvent.click(linkApple));

    expect(mockLinkSocial).toHaveBeenCalledWith({
      provider: "apple",
      callbackURL: "/assets/settings/login-methods?linked=apple",
      errorCallbackURL: "/assets/settings/login-methods?linking=apple",
    });
  });

  it("explains an apple account that belongs to another account and clears the address", async () => {
    mockListAccounts.mockResolvedValue({ data: [KAKAO], error: null });
    open({ linking: "apple", error: "account_already_linked_to_different_user" });

    expect(screen.getByRole("status")).toHaveTextContent(
      "이미 다른 계정에 연결된 Apple 계정이에요"
    );
    expect(onReturnParamsShown).toHaveBeenCalled();
  });

  it("unlinks one of two methods after confirming, and forgets it as this device's last method", async () => {
    window.localStorage.setItem(LAST_LOGIN_METHOD_KEY, "kakao");
    mockListAccounts.mockResolvedValueOnce({ data: [KAKAO, APPLE], error: null });
    mockListAccounts.mockResolvedValue({ data: [APPLE], error: null });
    mockUnlinkAccount.mockResolvedValue({ data: { status: true }, error: null });
    open();

    fireEvent.click(await screen.findByRole("button", { name: "카카오 연결 해제" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "해제하기" })));

    expect(mockUnlinkAccount).toHaveBeenCalledWith({ accountId: "acc-k" });
    expect(window.localStorage.getItem(LAST_LOGIN_METHOD_KEY)).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "카카오 연결" })).toBeInTheDocument()
    );
  });

  it("asks to sign in again when the session is too old to unlink", async () => {
    mockListAccounts.mockResolvedValue({ data: [KAKAO, APPLE], error: null });
    mockUnlinkAccount.mockResolvedValue({ data: null, error: { code: "SESSION_NOT_FRESH" } });
    open();

    fireEvent.click(await screen.findByRole("button", { name: "Apple 연결 해제" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "해제하기" })));

    expect(screen.getByRole("button", { name: "다시 로그인" })).toBeInTheDocument();
  });
});
