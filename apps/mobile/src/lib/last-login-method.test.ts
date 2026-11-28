import { describe, expect, it } from "vitest";
import {
  addressWithoutSignedInWith,
  forgetLastLoginMethod,
  LAST_LOGIN_METHOD_KEY,
  lastLoginMethodLabel,
  readLastLoginMethod,
  signedInWithFrom,
  signInCallbackURL,
  writeLastLoginMethod,
} from "./last-login-method";

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

describe("signInCallbackURL", () => {
  it("marks the return path with the provider so only a successful login lands there", () => {
    expect(signInCallbackURL("/rebalancing", "kakao")).toBe("/rebalancing?signedInWith=kakao");
  });
});

describe("signedInWithFrom", () => {
  it("reads the provider a successful login came back with", () => {
    expect(signedInWithFrom({ search: "?signedInWith=apple" })).toBe("apple");
  });

  it("ignores an unknown provider", () => {
    expect(signedInWithFrom({ search: "?signedInWith=google" })).toBeNull();
  });

  it("is null without the marker", () => {
    expect(signedInWithFrom({ search: "" })).toBeNull();
  });
});

describe("addressWithoutSignedInWith", () => {
  it("removes only the marker and keeps the path, other params and hash", () => {
    expect(
      addressWithoutSignedInWith({
        pathname: "/portfolios",
        search: "?signedInWith=kakao&a=1",
        hash: "#top",
      })
    ).toBe("/portfolios?a=1#top");
  });

  it("drops the question mark when nothing else is left", () => {
    expect(
      addressWithoutSignedInWith({ pathname: "/home", search: "?signedInWith=kakao", hash: "" })
    ).toBe("/home");
  });
});

describe("last login method on this device", () => {
  it("remembers the provider", () => {
    const storage = memoryStorage();

    writeLastLoginMethod(storage, "apple");

    expect(readLastLoginMethod(storage)).toBe("apple");
  });

  it("is null when nothing was recorded", () => {
    expect(readLastLoginMethod(memoryStorage())).toBeNull();
  });

  it("ignores a value it does not know", () => {
    expect(readLastLoginMethod(memoryStorage({ [LAST_LOGIN_METHOD_KEY]: "naver" }))).toBeNull();
  });

  it("forgets the provider when it is unlinked", () => {
    const storage = memoryStorage({ [LAST_LOGIN_METHOD_KEY]: "kakao" });

    forgetLastLoginMethod(storage, "kakao");

    expect(readLastLoginMethod(storage)).toBeNull();
  });

  it("keeps a different provider when another one is unlinked", () => {
    const storage = memoryStorage({ [LAST_LOGIN_METHOD_KEY]: "apple" });

    forgetLastLoginMethod(storage, "kakao");

    expect(readLastLoginMethod(storage)).toBe("apple");
  });
});

describe("lastLoginMethodLabel", () => {
  it.each([
    ["kakao", "최근에 카카오로 로그인했어요"],
    ["apple", "최근에 Apple로 로그인했어요"],
  ] as const)("names %s", (provider, label) => {
    expect(lastLoginMethodLabel(provider)).toBe(label);
  });
});
