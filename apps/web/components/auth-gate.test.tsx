import { fireEvent, render, screen } from "@testing-library/react";
import { STORAGE_MODE_KEY, type StorageMode } from "@web/lib/storage-mode";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    // 동의 확인만 답하고 나머지 API 는 실패시킨다.
    vi.stubGlobal("fetch", async (url: string) =>
      url === "/api/me/consents"
        ? Response.json({ agreed: true })
        : new Response(null, { status: 503 })
    );
    mockSignInSocial.mockResolvedValue({ data: {}, error: null });
    window.localStorage.clear();
    window.history.replaceState(null, "", "/assets");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a loading status while the session is pending", () => {
    mockUseSession.mockReturnValue({ data: null, isPending: true });

    render(
      <AuthGate>
        <div>앱 콘텐츠</div>
      </AuthGate>
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("앱 콘텐츠")).not.toBeInTheDocument();
  });

  it.each<StorageMode>(["local", "cloud"])(
    "renders children when a session exists in %s mode",
    async (mode) => {
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

      expect(await screen.findByText("앱 콘텐츠")).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Seedbook 로그인" })).not.toBeInTheDocument();
    }
  );

  it("asks for the storage mode after consent and before the app, without starting sync", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(url);
      return url === "/api/me/consents"
        ? Response.json({ agreed: true })
        : Response.json({ storageMode: "cloud", chosen: false, inUse: true });
    });
    mockUseSession.mockReturnValue({ data: { user: { id: "u-1" } }, isPending: false });

    render(
      <AuthGate>
        <div>앱 콘텐츠</div>
      </AuthGate>
    );

    expect(
      await screen.findByRole("heading", { name: "저장 방식을 확인해 주세요" })
    ).toBeInTheDocument();
    expect(screen.queryByText("앱 콘텐츠")).not.toBeInTheDocument();
    expect(urls).toEqual(["/api/me/consents", "/api/me/storage-mode"]);
  });

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

      expect(screen.getByRole("heading", { name: "Seedbook 로그인" })).toBeInTheDocument();
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
    expect(
      screen.queryByRole("button", { name: /브라우저 저장으로 전환/ })
    ).not.toBeInTheDocument();
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
      callbackURL: "/assets",
      errorCallbackURL: "/assets",
    });
  });

  it("keeps the login screen and its error while the session is checked again", () => {
    window.history.replaceState(null, "", "/assets?error=access_denied");
    mockUseSession.mockReturnValue({ data: null, isPending: false });
    const { rerender } = render(<AuthGate>앱 콘텐츠</AuthGate>);

    mockUseSession.mockReturnValue({ data: null, isPending: true });
    rerender(<AuthGate>앱 콘텐츠</AuthGate>);

    expect(screen.getByRole("alert")).toHaveTextContent("로그인을 취소했어요");
  });

  it("does not render the dev-bypass button outside of NODE_ENV=development", () => {
    // vitest 는 NODE_ENV 를 "test" 로 돌린다. 프로덕션 빌드에 dev-bypass 가
    // 새어 나가지 않도록 하는 회귀 테스트.
    mockUseSession.mockReturnValue({ data: null, isPending: false });

    render(
      <AuthGate>
        <div>앱 콘텐츠</div>
      </AuthGate>
    );

    expect(screen.queryByRole("button", { name: /개발용 빠른 로그인/ })).not.toBeInTheDocument();
  });
});
