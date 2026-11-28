import { describe, expect, it } from "vitest";
import {
  linkCallbackURLs,
  linkResultFrom,
  linkResultMessage,
  loginMethodRows,
  unlinkErrorMessage,
} from "./login-methods";

const kakao = { id: "acc-k", providerId: "kakao" };
const apple = { id: "acc-a", providerId: "apple" };

describe("loginMethodRows", () => {
  it("lists kakao and apple with what is linked", () => {
    expect(loginMethodRows([kakao], { appleEnabled: true })).toEqual([
      { provider: "kakao", label: "카카오", accountRowId: "acc-k", canUnlink: false },
      { provider: "apple", label: "Apple", accountRowId: null, canUnlink: false },
    ]);
  });

  it("lets either be unlinked when both are linked", () => {
    const rows = loginMethodRows([kakao, apple], { appleEnabled: true });
    expect(rows.map((row) => row.canUnlink)).toEqual([true, true]);
  });

  it("never lets the last login method be unlinked", () => {
    const rows = loginMethodRows([apple], { appleEnabled: true });
    expect(rows.find((row) => row.provider === "apple")?.canUnlink).toBe(false);
  });

  it("counts a non-social account (dev email login) toward the last-one rule", () => {
    const rows = loginMethodRows([{ id: "acc-c", providerId: "credential" }, kakao], {
      appleEnabled: false,
    });
    expect(rows).toEqual([
      { provider: "kakao", label: "카카오", accountRowId: "acc-k", canUnlink: true },
    ]);
  });

  it("hides apple when it is not set up on this server", () => {
    const rows = loginMethodRows([kakao], { appleEnabled: false });
    expect(rows.map((row) => row.provider)).toEqual(["kakao"]);
  });

  it("still shows a linked apple account when apple is not set up", () => {
    const rows = loginMethodRows([kakao, apple], { appleEnabled: false });
    expect(rows.map((row) => row.provider)).toEqual(["kakao", "apple"]);
  });

  it("hides a method this device cannot link (bundled app without the native plugin)", () => {
    const rows = loginMethodRows([kakao], {
      appleEnabled: true,
      available: (provider) => provider !== "apple",
    });
    expect(rows.map((row) => row.provider)).toEqual(["kakao"]);
  });

  it("still shows a linked method this device cannot link, so it can be unlinked", () => {
    const rows = loginMethodRows([kakao, apple], {
      appleEnabled: true,
      available: (provider) => provider !== "apple",
    });
    expect(rows.map((row) => row.provider)).toEqual(["kakao", "apple"]);
  });
});

describe("linkCallbackURLs", () => {
  it("returns to the same screen, marking success and failure apart", () => {
    expect(linkCallbackURLs("/settings/login-methods", "apple")).toEqual({
      callbackURL: "/settings/login-methods?linked=apple",
      errorCallbackURL: "/settings/login-methods?linking=apple",
    });
  });
});

describe("linkResultFrom", () => {
  it("reads a successful link", () => {
    expect(linkResultFrom({ linked: "kakao" })).toEqual({
      provider: "kakao",
      error: null,
    });
  });

  it("reads a failed link with the error better-auth appended", () => {
    expect(
      linkResultFrom({ linking: "apple", error: "account_already_linked_to_different_user" })
    ).toEqual({ provider: "apple", error: "account_already_linked_to_different_user" });
  });

  it("treats a failure mark without an error code as an unknown failure", () => {
    expect(linkResultFrom({ linking: "apple" })).toEqual({
      provider: "apple",
      error: "unknown",
    });
  });

  it("ignores unknown providers and plain visits", () => {
    expect(linkResultFrom({ linked: "google" })).toBeNull();
    expect(linkResultFrom({})).toBeNull();
  });
});

describe("linkResultMessage", () => {
  it("confirms a new link", () => {
    expect(linkResultMessage({ provider: "apple", error: null })).toEqual({
      tone: "positive",
      text: "Apple 계정을 연결했어요. 이제 Apple로도 로그인할 수 있어요.",
    });
  });

  it("explains that the account belongs to another Seedbook account", () => {
    expect(
      linkResultMessage({ provider: "apple", error: "account_already_linked_to_different_user" })
        .text
    ).toContain("이미 다른 계정에 연결된 Apple 계정이에요");
  });

  it.each(["access_denied", "user_cancelled_authorize"])("says %s was a cancellation", (error) => {
    expect(linkResultMessage({ provider: "kakao", error }).text).toBe("연결을 취소했어요.");
  });

  it("does not show text taken from the address", () => {
    const { text } = linkResultMessage({ provider: "kakao", error: "call 010-0000-0000" });
    expect(text).toBe("카카오 계정을 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
  });
});

describe("unlinkErrorMessage", () => {
  it("asks to sign in again when the session is older than a day", () => {
    expect(unlinkErrorMessage("SESSION_NOT_FRESH")).toContain("다시 로그인");
  });

  it("explains the last method cannot be unlinked", () => {
    expect(unlinkErrorMessage("FAILED_TO_UNLINK_LAST_ACCOUNT")).toBe(
      "마지막 로그인 수단은 해제할 수 없어요."
    );
  });

  it("falls back to a generic failure", () => {
    expect(unlinkErrorMessage(undefined)).toBe("해제하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
  });
});
