import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_MODE_KEY, type StorageMode } from "@web/lib/storage-mode";
import { AuthGate } from "./auth-gate";

// Better Auth 의 React 클라이언트는 jsdom 환경에서 fetch 를 때리므로 통째로
// 모킹한다. 각 테스트가 useSession 이 돌려줄 값을 지정한다.
const mockUseSession = vi.fn();
const mockSignInSocial = vi.fn();

vi.mock("@web/lib/auth-client", () => ({
  useSession: () => mockUseSession(),
  authClient: {
    signIn: {
      social: (opts: unknown) => mockSignInSocial(opts),
    },
  },
}));

function setStorageMode(mode: StorageMode) {
  window.localStorage.setItem(STORAGE_MODE_KEY, mode);
}

describe("AuthGate", () => {
  beforeEach(() => {
    mockUseSession.mockReset();
    mockSignInSocial.mockReset();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing while the session is pending", () => {
    mockUseSession.mockReturnValue({ data: null, isPending: true });

    const { container } = render(
      <AuthGate>
        <div>앱 콘텐츠</div>
      </AuthGate>
    );

    expect(container).toBeEmptyDOMElement();
  });

  it.each<StorageMode>(["local", "cloud"])(
    "renders children when a session exists in %s mode",
    (mode) => {
      setStorageMode(mode);
      mockUseSession.mockReturnValue({
        data: { user: { id: "u-1" } },
        isPending: false,
      });

      render(
        <AuthGate>
          <div>앱 콘텐츠</div>
        </AuthGate>
      );

      expect(screen.getByText("앱 콘텐츠")).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "로그인이 필요합니다" })).not.toBeInTheDocument();
    }
  );

  it.each<StorageMode>(["local", "cloud"])(
    "renders the login screen when there is no session in %s mode",
    (mode) => {
      setStorageMode(mode);
      mockUseSession.mockReturnValue({ data: null, isPending: false });

      render(
        <AuthGate>
          <div>앱 콘텐츠</div>
        </AuthGate>
      );

      expect(screen.getByRole("heading", { name: "로그인이 필요합니다" })).toBeInTheDocument();
      expect(screen.queryByText("앱 콘텐츠")).not.toBeInTheDocument();
    }
  );

  it("does not expose a 'switch to browser storage' escape hatch", () => {
    mockUseSession.mockReturnValue({ data: null, isPending: false });

    render(
      <AuthGate>
        <div>앱 콘텐츠</div>
      </AuthGate>
    );

    // 로그인 없이 앱에 들어갈 수 있던 유일한 경로였다 — 회귀 방지.
    expect(screen.queryByRole("button", { name: /브라우저 저장으로 전환/ })).not.toBeInTheDocument();
  });

  it("calls Kakao social sign-in when the login button is clicked", () => {
    mockUseSession.mockReturnValue({ data: null, isPending: false });

    render(
      <AuthGate>
        <div>앱 콘텐츠</div>
      </AuthGate>
    );

    fireEvent.click(screen.getByRole("button", { name: "카카오로 로그인" }));

    expect(mockSignInSocial).toHaveBeenCalledTimes(1);
    expect(mockSignInSocial).toHaveBeenCalledWith({
      provider: "kakao",
      callbackURL: "/dashboard",
    });
  });
});
