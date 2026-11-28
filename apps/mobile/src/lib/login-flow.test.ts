import { describe, expect, it } from "vitest";
import { DEFAULT_RETURN_PATH, loginErrorMessage, resolveReturnPath } from "./login-flow";

describe("resolveReturnPath", () => {
  it("falls back to the app home", () => {
    expect(DEFAULT_RETURN_PATH).toBe("/home");
  });

  it.each([
    "/home",
    "/rebalancing",
    "/accounts/f87e0fdc-2e42-4783-bb19-bae7fcb30a3f",
    "/rebalancing/sessions/s_1/trades/t-2",
    "/portfolios/p-1",
    "/settings/login-methods",
  ])("returns to the app screen %s", (path) => {
    expect(resolveReturnPath(path)).toBe(path);
  });

  it("drops the trailing slash the mobile stack leaves in the address bar", () => {
    expect(resolveReturnPath("/rebalancing/")).toBe("/rebalancing");
  });

  it.each([
    "https://evil.example/home",
    "//evil.example/home",
    "/\\evil.example",
    "/home//evil.example",
    "/home/../api/auth/sign-out",
    "/home/%2e%2e/api",
    "/home/@evil.example",
    "/home\\evil.example",
    "/home?next=https://evil.example",
    "/accounts\n/x",
    "/home\n",
    "javascript:alert(1)",
    "/homeevil",
    "/api/auth/error",
    "/m/home",
    "/terms",
    "/assets",
    "/",
    "",
  ])("falls back to home for %j", (path) => {
    expect(resolveReturnPath(path)).toBe(DEFAULT_RETURN_PATH);
  });
});

describe("loginErrorMessage", () => {
  it("shows nothing without an error", () => {
    expect(loginErrorMessage(null)).toBeNull();
  });

  it.each(["access_denied", "user_cancelled_authorize"])("says %s was a cancellation", (code) => {
    expect(loginErrorMessage(code)).toContain("취소");
  });

  it("asks for email consent when the provider gave no email", () => {
    expect(loginErrorMessage("email_not_found")).toContain("이메일");
  });

  it("explains that an unlinked login method cannot sign in", () => {
    expect(loginErrorMessage("account_not_linked")).toContain("연결을 해제한 로그인 수단");
  });

  it.each(["state_mismatch", "state_not_found", "state_invalid"])(
    "asks to start over for %s",
    (code) => {
      expect(loginErrorMessage(code)).toContain("처음부터");
    }
  );

  it.each(["internal_server_error", "constructor", "<script>"])(
    "never echoes an unknown code (%s)",
    (code) => {
      const message = loginErrorMessage(code);
      expect(message).toBe("로그인하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    }
  );
});
