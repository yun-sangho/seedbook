import { describe, expect, it } from "vitest";
import { generateInviteToken, INVITE_DEFAULT_TTL_MS } from "./generate-invite-token";

describe("generateInviteToken", () => {
  it("base64url 알파벳 [A-Za-z0-9_-] 만 사용한다", () => {
    for (let i = 0; i < 100; i += 1) {
      const token = generateInviteToken();
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("24 bytes base64url 인코딩이라 32 글자다", () => {
    const token = generateInviteToken();
    expect(token.length).toBe(32);
  });

  it("매 호출마다 서로 다른 값이다 (난수)", () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 1000; i += 1) {
      tokens.add(generateInviteToken());
    }
    expect(tokens.size).toBe(1000);
  });
});

describe("INVITE_DEFAULT_TTL_MS", () => {
  it("7 일에 해당한다", () => {
    expect(INVITE_DEFAULT_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
