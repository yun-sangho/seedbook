// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isOpRefusedByDatabase } from "./push";

const pgError = (code: string) => Object.assign(new Error("db"), { code });

describe("isOpRefusedByDatabase", () => {
  it.each(["23503", "23505", "23514", "22003", "22P02"])(
    "answers invalid for %s (the op's value is refused — resending gives the same result)",
    (code) => {
      expect(isOpRefusedByDatabase(pgError(code))).toBe(true);
    }
  );

  it.each(["42703", "23502", "40001", "08006", "57014"])(
    "fails the request for %s (a server-side problem the device should retry, e.g. mid-deploy)",
    (code) => {
      expect(isOpRefusedByDatabase(pgError(code))).toBe(false);
    }
  );

  it("reads the code drizzle keeps in the cause", () => {
    expect(isOpRefusedByDatabase(new Error("wrapped", { cause: pgError("23503") }))).toBe(true);
  });

  it("fails the request for an error without a database code", () => {
    expect(isOpRefusedByDatabase(new Error("boom"))).toBe(false);
  });
});
