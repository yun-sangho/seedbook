import { describe, expect, it } from "vitest";
import { nicknameError } from "./profile";
import { NICKNAME_ADJECTIVES, NICKNAME_NOUNS, randomNickname } from "./seed-nickname";

describe("randomNickname", () => {
  it("joins an adjective and a noun with a space", () => {
    expect(randomNickname(() => 0)).toBe(`${NICKNAME_ADJECTIVES[0]} ${NICKNAME_NOUNS[0]}`);
  });

  it("every combination passes the nickname rules", () => {
    for (const adjective of NICKNAME_ADJECTIVES) {
      for (const noun of NICKNAME_NOUNS) {
        expect(nicknameError(`${adjective} ${noun}`)).toBeNull();
      }
    }
  });
});
