import { describe, expect, it } from "vitest";
import { deleteAccount } from "./delete-account";

function fakeStorage(entries: Record<string, string>) {
  const data = new Map(Object.entries(entries));
  return {
    data,
    clear: () => data.clear(),
  };
}

describe("deleteAccount", () => {
  it("returns deleted and clears this browser's stored data when the server deletes the user", async () => {
    const storage = fakeStorage({ "investment-storage": "{}", "portfolio-storage": "{}" });

    const result = await deleteAccount({ deleteUser: async () => ({ error: null }) }, storage);

    expect(result).toBe("deleted");
    expect(storage.data.size).toBe(0);
  });

  it("asks to sign in again when the session is too old to delete the account", async () => {
    const storage = fakeStorage({ "investment-storage": "{}" });

    const result = await deleteAccount(
      { deleteUser: async () => ({ error: { code: "SESSION_EXPIRED", status: 400 } }) },
      storage
    );

    expect(result).toBe("reauth-required");
  });

  it("keeps local data when the server asks to sign in again", async () => {
    const storage = fakeStorage({ "investment-storage": "{}" });

    await deleteAccount(
      { deleteUser: async () => ({ error: { code: "SESSION_EXPIRED", status: 400 } }) },
      storage
    );

    expect(storage.data.size).toBe(1);
  });

  it("returns failed and keeps local data on any other server error", async () => {
    const storage = fakeStorage({ "investment-storage": "{}" });

    const result = await deleteAccount(
      { deleteUser: async () => ({ error: { code: "INTERNAL_SERVER_ERROR", status: 500 } }) },
      storage
    );

    expect(result).toBe("failed");
    expect(storage.data.size).toBe(1);
  });

  it("returns failed when the request itself throws (network error)", async () => {
    const storage = fakeStorage({});

    const result = await deleteAccount(
      {
        deleteUser: async () => {
          throw new TypeError("Failed to fetch");
        },
      },
      storage
    );

    expect(result).toBe("failed");
  });

  it("waits for the app database to be cleared before reporting the account deleted", async () => {
    const data = new Map([["investment-storage", "{}"]]);
    const storage = {
      clear: async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        data.clear();
      },
    };

    const result = await deleteAccount({ deleteUser: async () => ({ error: null }) }, storage);

    expect(result).toBe("deleted");
    expect(data.size).toBe(0);
  });
});
