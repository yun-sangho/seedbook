import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginScreen } from "./login-screen";

// 외부 경계(better-auth 클라이언트)만 모킹한다.
const mockSignInSocial = vi.fn();
vi.mock("@web/lib/auth-client", () => ({
  authClient: { signIn: { social: (opts: unknown) => mockSignInSocial(opts) } },
}));

function openAt(url: string) {
  window.history.replaceState(null, "", url);
  render(<LoginScreen />);
}

const kakao = () => screen.getByRole("button", { name: /카카오로 로그인/ });

describe("LoginScreen", () => {
  beforeEach(() => {
    mockSignInSocial.mockReset();
    mockSignInSocial.mockResolvedValue({ data: {}, error: null });
  });

  it("returns to the screen that asked for login, on success and on failure", async () => {
    openAt("/assets/rebalancing/");
    await act(async () => fireEvent.click(kakao()));
    expect(mockSignInSocial).toHaveBeenCalledWith({
      provider: "kakao",
      callbackURL: "/assets/rebalancing",
      errorCallbackURL: "/assets/rebalancing",
    });
  });

  it("explains a cancelled login and removes the error from the address", () => {
    openAt("/assets/rebalancing?error=access_denied&error_description=User+denied");
    expect(screen.getByRole("alert")).toHaveTextContent("로그인을 취소했어요");
    expect(window.location.pathname + window.location.search).toBe("/assets/rebalancing");
  });

  it("does not show text taken from the address", () => {
    openAt("/assets?error=call+010-0000-0000&error_description=evil");
    expect(screen.getByRole("alert")).toHaveTextContent("로그인하지 못했어요");
    expect(screen.queryByText(/010-0000|evil/)).not.toBeInTheDocument();
  });

  it("stays busy after the login has started", async () => {
    openAt("/assets?error=access_denied");
    await act(async () => fireEvent.click(kakao()));
    expect(kakao()).toHaveAttribute("data-loading");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("is usable again after coming back from the provider with the back button", async () => {
    openAt("/assets");
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
    openAt("/assets");
    await act(async () => fireEvent.click(kakao()));
    expect(screen.getByRole("alert")).toHaveTextContent("로그인하지 못했어요");
    expect(kakao()).not.toHaveAttribute("data-loading");
  });

  it("tells the user that no name, email or photo is collected", () => {
    openAt("/assets");
    expect(screen.getByText(/이름·이메일·프로필 사진은 받지 않아요/)).toBeInTheDocument();
  });

  it("links to the privacy policy", () => {
    openAt("/assets");
    expect(screen.getByRole("link", { name: "개인정보처리방침" })).toHaveAttribute(
      "href",
      "/privacy"
    );
  });
});
