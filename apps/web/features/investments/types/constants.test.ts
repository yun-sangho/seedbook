import { describe, expect, it } from "vitest";
import { ACCOUNT_TYPES, AccountType } from "./constants";

describe("ACCOUNT_TYPES", () => {
  it("does not offer the overseas account type for new accounts", () => {
    expect(ACCOUNT_TYPES).not.toContain(AccountType.FOREIGN);
  });

  it("offers the domestic account types", () => {
    expect(ACCOUNT_TYPES).toEqual([
      AccountType.GENERAL,
      AccountType.ISA,
      AccountType.IRP,
      AccountType.PENSION,
    ]);
  });
});
