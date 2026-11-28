import { describe, expect, it } from "vitest";
import { checkSchemaVersion } from "./protocol";

describe("checkSchemaVersion", () => {
  const range = { min: 3, current: 5 };

  it("accepts every version from MIN_SCHEMA to the current one", () => {
    expect([3, 4, 5].map((v) => checkSchemaVersion(v, range))).toEqual(["ok", "ok", "ok"]);
  });

  it("asks apps below MIN_SCHEMA to update", () => {
    expect(checkSchemaVersion(2, range)).toBe("too_old");
  });

  it("tells apps newer than the server to wait", () => {
    expect(checkSchemaVersion(6, range)).toBe("ahead");
  });
});
