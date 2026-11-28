import { LAST_LOGIN_METHOD_KEY } from "@mobile/lib/last-login-method";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginScreen } from "./login-screen";

// 외부 경계(better-auth 클라이언트)만 모킹한다.
const mockSignInSocial = vi.fn();
vi.mock("@mobile/lib/auth-client", () => ({
  authClient: { signIn: { social: (opts: unknown) => mockSignInSocial(opts) } },
}));

function openAt(url: string) {
  window.history.replaceState(null, "", url);
  render(<LoginScreen />);
}

const kakao = () => screen.getByRole("button", { name: /카카오 로그인/ });

describe("LoginScreen", () => {
  beforeEach(() => {
    mockSignInSocial.mockReset();
    window.localStorage.clear();
    mockSignInSocial.mockResolvedValue({ data: {}, error: null });
  });

  it("marks only the success return with the provider, so a failed login is not remembered", async () => {
    openAt("/home");
    await act(async () => fireEvent.click(kakao()));
    expect(mockSignInSocial).toHaveBeenCalledTimes(1);
    const { callbackURL, errorCallbackURL } = mockSignInSocial.mock.calls[0]?.[0] ?? {};
    expect(callbackURL).toContain("signedInWith=kakao");
    expect(errorCallbackURL).not.toContain("signedInWith");
  });

  it("follows Kakao's login button guide: the official label with the speech-bubble symbol", () => {
    openAt("/home");
    expect(kakao()).toHaveTextContent(/^카카오 로그인$/);
    expect(kakao().querySelector("svg")).not.toBeNull();
  });

  it("points at the provider this device last signed in with", () => {
    window.localStorage.setItem(LAST_LOGIN_METHOD_KEY, "kakao");
    openAt("/home");
    expect(screen.getByText("최근에 카카오로 로그인했어요")).toBeInTheDocument();
  });

  it("shows no hint on a device that has not signed in yet", () => {
    openAt("/home");
    expect(screen.queryByText(/최근에 .+로 로그인했어요/)).not.toBeInTheDocument();
  });

  it("returns to the screen that asked for login, on success and on failure", async () => {
    openAt("/rebalancing/");
    await act(async () => fireEvent.click(kakao()));
    expect(mockSignInSocial).toHaveBeenCalledWith({
      provider: "kakao",
      callbackURL: "/rebalancing?signedInWith=kakao",
      errorCallbackURL: "/rebalancing",
    });
  });

  it("explains a cancelled login and removes the error from the address", () => {
    openAt("/rebalancing?error=access_denied&error_description=User+denied");
    expect(screen.getByRole("alert")).toHaveTextContent("로그인을 취소했어요");
    expect(window.location.pathname + window.location.search).toBe("/rebalancing");
  });

  it("does not show text taken from the address", () => {
    openAt("/home?error=call+010-0000-0000&error_description=evil");
    expect(screen.getByRole("alert")).toHaveTextContent("로그인하지 못했어요");
    expect(screen.queryByText(/010-0000|evil/)).not.toBeInTheDocument();
  });

  it("stays busy after the login has started", async () => {
    openAt("/home?error=access_denied");
    await act(async () => fireEvent.click(kakao()));
    expect(kakao()).toHaveAttribute("data-loading");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("is usable again after coming back from the provider with the back button", async () => {
    openAt("/home");
    await act(async () => fireEvent.click(kakao()));
    act(() => {
      window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    });
    expect(kakao()).not.toHaveAttribute("data-loading");
  });

  it.each([
    ["the server refuses", () => Promise.resolve({ data: null, error: { status: 500 } })],
    ["the network fails", () => Promise.reject(new TypeError("Failed to fetch"))],
  ])("lets the user retry when %s", async (_, response) => {
    mockSignInSocial.mockImplementation(response);
    openAt("/home");
    await act(async () => fireEvent.click(kakao()));
    expect(screen.getByRole("alert")).toHaveTextContent("로그인하지 못했어요");
    expect(kakao()).not.toHaveAttribute("data-loading");
  });

  it("tells the user that nothing from the login provider (name, email, ID) is used", () => {
    openAt("/home");
    expect(
      screen.getByText("이름·이메일·아이디 등 타 서비스의 정보는 활용하지 않아요.")
    ).toBeInTheDocument();
  });

  it("opens the privacy policy inside the app, without leaving the login screen", async () => {
    openAt("/home");
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "개인정보처리방침" }))
    );
    expect(screen.getByRole("dialog", { name: "개인정보처리방침" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Seedbook 로그인" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/home");
  });
});
