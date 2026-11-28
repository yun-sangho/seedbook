import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrateDeviceDatabase } from "./native/device-db/migrations";
import { createNodeSqliteDriver } from "./native/device-db/testing/node-sqlite-driver";

/** 같은 기기에서 앱(페이지)을 새로 연 것처럼 모듈을 다시 불러온다. */
let driver = createNodeSqliteDriver();
let reload = vi.fn();

async function launch(userId: string | null, platform: "web" | "native") {
  vi.resetModules();
  vi.doMock("./device", () => ({ isNativeAppUserAgent: () => platform === "native" }));
  vi.doMock("./native/device-db/capacitor-driver", () => ({
    openCapacitorSqlDriver: async () => driver,
    openCapacitorSnapshotStore: async () => null,
  }));
  const mod = await import("./account-storage");
  const { getDeviceStorage } = await import("./device-storage");
  await mod.activateAccount(userId);
  return { ...mod, device: getDeviceStorage() };
}

const envelope = (accountName: string) =>
  JSON.stringify({
    state: {
      investments: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          accountName,
          accountType: "일반 투자 계좌",
          currency: "KRW",
          initialInvestment: 0,
          currentValue: 0,
          note: "",
          color: "#000000",
          sellCostPercent: 0,
          records: [],
          holdings: [],
          cashItems: [],
        },
      ],
      holdingsSortOption: "evalDesc",
    },
    version: 6,
  });

const nameIn = (raw: string | null) =>
  raw === null ? null : (JSON.parse(raw).state.investments[0]?.accountName ?? null);

beforeEach(() => {
  localStorage.clear();
  driver = createNodeSqliteDriver();
  reload = vi.fn();
  vi.stubGlobal("location", { reload } as unknown as Location);
});

afterEach(() => {
  vi.doUnmock("./device");
  vi.doUnmock("./native/device-db/capacitor-driver");
  vi.unstubAllGlobals();
});

describe.each(["web", "native"] as const)("account storage (%s)", (platform) => {
  it("leaves ownerless data for the next account when a new account declines", async () => {
    const seed = await launch(null, platform);
    await seed.device.writeEnvelope("investment-storage", envelope("예전 계좌"));
    await seed.device.flush();

    const declined = await launch("new-user", platform);
    await declined.releaseAccountSlot();

    const next = await launch("next-user", platform);
    expect(nameIn(await next.accountStorage.readEnvelope("investment-storage"))).toBe("예전 계좌");
  });

  it("does not release another account's data when a new account declines", async () => {
    const a = await launch("user-a", platform);
    await a.accountStorage.writeEnvelope("investment-storage", envelope("A의 계좌"));
    await a.device.flush();

    const declined = await launch("new-user", platform);
    await declined.releaseAccountSlot();

    const next = await launch("next-user", platform);
    expect(await next.accountStorage.readEnvelope("investment-storage")).toBeNull();
    const back = await launch("user-a", platform);
    expect(nameIn(await back.accountStorage.readEnvelope("investment-storage"))).toBe("A의 계좌");
  });

  it("keeps every kind of account data apart and returns it to its owner", async () => {
    const a = await launch("user-a", platform);
    await a.accountStorage.writeEnvelope("investment-storage", envelope("A의 계좌"));
    a.accountStorage.setItem("seedbook.storageMode", "cloud");
    a.accountStorage.setItem("seedbook.sync.investment", "A의 대기열");
    await a.device.flush();

    const b = await launch("user-b", platform);
    expect(await b.accountStorage.readEnvelope("investment-storage")).toBeNull();
    expect(b.accountStorage.getItem("seedbook.storageMode")).toBeNull();
    expect(b.accountStorage.getItem("seedbook.sync.investment")).toBeNull();
    await b.accountStorage.writeEnvelope("investment-storage", envelope("B의 계좌"));
    await b.device.flush();

    const aAgain = await launch("user-a", platform);
    expect(nameIn(await aAgain.accountStorage.readEnvelope("investment-storage"))).toBe("A의 계좌");
    expect(aAgain.accountStorage.getItem("seedbook.storageMode")).toBe("cloud");
    expect(aAgain.accountStorage.getItem("seedbook.sync.investment")).toBe("A의 대기열");
    const bAgain = await launch("user-b", platform);
    expect(nameIn(await bAgain.accountStorage.readEnvelope("investment-storage"))).toBe("B의 계좌");
  });

  it("reads and writes nothing while signed out", async () => {
    const a = await launch("user-a", platform);
    await a.accountStorage.writeEnvelope("investment-storage", envelope("A의 계좌"));
    await a.device.flush();

    const signedOut = await launch(null, platform);
    await signedOut.accountStorage.writeEnvelope("investment-storage", envelope("주인 없음"));

    expect(await signedOut.accountStorage.readEnvelope("investment-storage")).toBeNull();
    const aAgain = await launch("user-a", platform);
    expect(nameIn(await aAgain.accountStorage.readEnvelope("investment-storage"))).toBe("A의 계좌");
  });

  it("shows data from before ownership to the first account and to no one after", async () => {
    const legacy = await launch(null, platform);
    await legacy.device.writeEnvelope("investment-storage", envelope("예전 계좌"));
    await legacy.device.flush();

    const a = await launch("user-a", platform);
    expect(nameIn(await a.accountStorage.readEnvelope("investment-storage"))).toBe("예전 계좌");
    const b = await launch("user-b", platform);
    expect(await b.accountStorage.readEnvelope("investment-storage")).toBeNull();
  });

  it("leaves data unclaimed when the old sync queues name different people", async () => {
    const legacy = await launch(null, platform);
    await legacy.device.writeEnvelope("investment-storage", envelope("예전 계좌"));
    legacy.device.setItem("seedbook.sync.investment", JSON.stringify({ userId: "user-a" }));
    legacy.device.setItem("seedbook.sync.portfolio", JSON.stringify({ userId: "user-b" }));
    await legacy.device.flush();

    const a = await launch("user-a", platform);

    expect(await a.accountStorage.readEnvelope("investment-storage")).toBeNull();
    expect(a.device.getItem("seedbook.owner")).toBeNull();
    expect(nameIn(await a.device.readEnvelope("investment-storage"))).toBe("예전 계좌");
  });

  it("closes the account and reloads when a different user signs in on the same page", async () => {
    const a = await launch("user-a", platform);
    await a.activateAccount("user-b");

    await a.accountStorage.writeEnvelope("investment-storage", envelope("늦은 쓰기"));
    await a.device.flush();

    expect(reload).toHaveBeenCalledTimes(1);
    const aAgain = await launch("user-a", platform);
    expect(await aAgain.accountStorage.readEnvelope("investment-storage")).toBeNull();
  });

  it("keeps the account open when the session is only lost for a while", async () => {
    const a = await launch("user-a", platform);
    await a.activateAccount(null);
    await a.activateAccount("user-a");

    expect(reload).not.toHaveBeenCalled();
    expect(a.getActiveAccount()).toBe("user-a");
  });

  describe("deleting an account", () => {
    it("clears everything on the device when no one else used it", async () => {
      const a = await launch("user-a", platform);
      await a.accountStorage.writeEnvelope("investment-storage", envelope("A의 계좌"));
      a.device.setItem("seedbook.app-lock", "on");

      await a.accountStorage.clear();

      const next = await launch("user-c", platform);
      expect(await next.accountStorage.readEnvelope("investment-storage")).toBeNull();
      expect(next.device.getItem("seedbook.app-lock")).toBeNull();
    });

    it.each([
      { leaving: "user-a", staying: "user-b" },
      { leaving: "user-b", staying: "user-a" },
    ])("removes only $leaving's data when $staying also used the device", async (who) => {
      for (const userId of ["user-a", "user-b"]) {
        const page = await launch(userId, platform);
        await page.accountStorage.writeEnvelope("investment-storage", envelope(userId));
        page.accountStorage.setItem("seedbook.storageMode", "cloud");
        page.accountStorage.setItem("seedbook.sync.investment", "대기열");
        await page.device.flush();
      }
      const leaving = await launch(who.leaving, platform);
      leaving.device.setItem(
        "seedbook.biometric-login",
        JSON.stringify({ credentialId: "c", userId: who.leaving })
      );

      await leaving.accountStorage.clear();
      await leaving.accountStorage.writeEnvelope("investment-storage", envelope("늦은 쓰기"));

      const gone = await launch(who.leaving, platform);
      expect(nameIn(await gone.accountStorage.readEnvelope("investment-storage"))).toBeNull();
      expect(gone.accountStorage.getItem("seedbook.storageMode") ?? "local").toBe("local");
      expect(gone.accountStorage.getItem("seedbook.sync.investment")).toBeNull();
      expect(gone.device.getItem("seedbook.biometric-login")).toBeNull();
      const staying = await launch(who.staying, platform);
      expect(nameIn(await staying.accountStorage.readEnvelope("investment-storage"))).toBe(
        who.staying
      );
    });
  });

  it("ignores a stale tab's write after someone else took over its slot", async () => {
    const stale = await launch("user-a", "web");
    const other = await launch("user-a", "web");
    await other.accountStorage.clear();
    const c = await launch("user-c", "web");
    await c.accountStorage.writeEnvelope("investment-storage", envelope("C의 계좌"));

    await stale.accountStorage.writeEnvelope("investment-storage", envelope("A의 늦은 쓰기"));

    expect(nameIn(localStorage.getItem("investment-storage"))).toBe("C의 계좌");
  });
});

describe("account storage on the native app", () => {
  it("keeps the second account out of the asset records", async () => {
    await migrateDeviceDatabase(driver);
    const a = await launch("user-a", "native");
    await a.accountStorage.writeEnvelope("investment-storage", envelope("A의 계좌"));
    const b = await launch("user-b", "native");
    await b.accountStorage.writeEnvelope("investment-storage", envelope("B의 계좌"));
    await b.device.flush();

    expect(
      await driver.query(
        "SELECT json_extract(data, '$.accountName') AS accountName FROM records WHERE type = 'account'"
      )
    ).toEqual([{ accountName: "A의 계좌" }]);
  });
});

describe("accountFetch", () => {
  it("names the account the page was opened for, even after it was closed", async () => {
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    const a = await launch("user-a", "web");
    await a.activateAccount("user-b");

    await a.accountFetch("/api/sync/mutations", { headers: { "content-type": "x" } });

    expect(fetchMock).toHaveBeenCalledWith("/api/sync/mutations", {
      headers: { "content-type": "x", "x-seedbook-account": "user-a" },
    });
  });

  it("sends the request to the API base URL", async () => {
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.com");
    const a = await launch("user-a", "web");

    await a.accountFetch("/api/me/preferences", { credentials: "include" });
    vi.unstubAllEnvs();

    expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/api/me/preferences", {
      credentials: "include",
      headers: { "x-seedbook-account": "user-a" },
    });
  });
});
