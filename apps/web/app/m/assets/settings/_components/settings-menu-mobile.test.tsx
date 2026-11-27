import { fireEvent, render, screen, within } from "@testing-library/react";
import { type PwaInstall, PwaInstallContext } from "@web/hooks/use-pwa-install";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsMenuMobile } from "./settings-menu-mobile";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  biometryLabel: null as string | null,
  storageMode: "local" as "local" | "cloud",
}));

vi.mock("@seed-design/react", (importOriginal) => importOriginal());
vi.mock("@stackflow/react", () => ({ useFlow: () => ({ push: mocks.push }) }));
vi.mock("@web/components/mobile/profile-menu", () => ({
  SessionUserAvatar: () => <span>아바타</span>,
  useSessionUser: () => ({ id: "u-1", name: "푸른 새싹", image: null }),
}));
vi.mock("@web/hooks/use-biometry-label", () => ({ useBiometryLabel: () => mocks.biometryLabel }));
vi.mock("@web/components/mobile/app-lock", () => ({
  AppLockSettingItem: () => <li>앱 잠금</li>,
}));
vi.mock("@web/components/mobile/biometric-login", () => ({
  BiometricLoginSettingItem: () => <li>생체 인증 로그인</li>,
}));
vi.mock("@web/lib/storage-mode", () => ({ getStorageMode: () => mocks.storageMode }));
vi.mock("@web/lib/auth-client", () => ({ authClient: { signOut: vi.fn() } }));

const WEB: PwaInstall = {
  mode: "unavailable",
  install: async () => {},
  isIOS: false,
  isNativeApp: false,
};

function renderMenu(pwa: Partial<PwaInstall> = {}) {
  return render(
    <PwaInstallContext.Provider value={{ ...WEB, ...pwa }}>
      <SettingsMenuMobile />
    </PwaInstallContext.Provider>
  );
}

const section = (name: string) => screen.getByRole("region", { name });
const sectionTitles = () =>
  screen.getAllByRole("region").map((region) => within(region).getByRole("heading").textContent);

describe("SettingsMenuMobile", () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.biometryLabel = null;
    mocks.storageMode = "local";
  });

  it("shows the profile card first, then data, account and info sections", () => {
    renderMenu();

    expect(screen.getByRole("button", { name: /푸른 새싹/ })).toBeInTheDocument();
    expect(sectionTitles()).toEqual(["데이터", "계정", "정보"]);
  });

  it("lists each section's items", () => {
    renderMenu();

    expect(within(section("데이터")).getByRole("button", { name: /저장 위치/ })).toBeVisible();
    expect(
      within(section("데이터")).getByRole("button", { name: /백업·데모 데이터/ })
    ).toBeVisible();
    for (const name of ["로그인 수단", "로그아웃", "탈퇴하기"]) {
      expect(within(section("계정")).getByRole("button", { name: new RegExp(name) })).toBeVisible();
    }
    for (const name of ["이용약관", "개인정보처리방침"]) {
      expect(within(section("정보")).getByRole("button", { name: new RegExp(name) })).toBeVisible();
    }
  });

  it.each([
    [/푸른 새싹/, "Profile"],
    [/저장 위치/, "StorageMode"],
    [/백업·데모 데이터/, "DataBackup"],
    [/로그인 수단/, "LoginMethods"],
    [/탈퇴하기/, "DeleteAccount"],
  ])("opens the %s screen", (name, activity) => {
    renderMenu();

    fireEvent.click(screen.getByRole("button", { name }));

    expect(mocks.push).toHaveBeenCalledWith(activity, {});
  });

  it("shows the current storage mode on its row", () => {
    mocks.storageMode = "cloud";
    renderMenu();

    expect(screen.getByRole("button", { name: /저장 위치/ })).toHaveTextContent("클라우드에 저장");
  });

  it("warns on the storage row that the native app keeps data apart from the browser", () => {
    renderMenu({ isNativeApp: true });

    expect(screen.getByRole("button", { name: /저장 위치/ })).toHaveTextContent(
      "이 기기에만 저장 · 앱과 브라우저는 데이터가 따로 저장돼요"
    );
  });

  it("adds the app section with app lock and biometric login when biometrics are available", () => {
    mocks.biometryLabel = "Face ID";
    renderMenu();

    expect(within(section("앱")).getByText("앱 잠금")).toBeVisible();
    expect(within(section("앱")).getByText("생체 인증 로그인")).toBeVisible();
  });

  it("offers installing to the home screen in the app section", async () => {
    const install = vi.fn(async () => {});
    renderMenu({ mode: "prompt", install });

    fireEvent.click(within(section("앱")).getByRole("button", { name: /홈 화면에 앱 설치/ }));

    expect(install).toHaveBeenCalled();
  });
});
