import { act, fireEvent, render, screen } from "@testing-library/react";
import { __resetAccountForTests, activateAccount } from "@web/lib/account-storage";
import { STORAGE_MODE_KEY } from "@web/lib/storage-mode";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StorageChoiceGate } from "./storage-choice-gate";

const { uploadAllToCloud, downloadAllFromCloud } = vi.hoisted(() => ({
  uploadAllToCloud: vi.fn(),
  downloadAllFromCloud: vi.fn(),
}));
vi.mock("@web/lib/storage-migration", () => ({ uploadAllToCloud, downloadAllFromCloud }));

const puts: unknown[] = [];
let status: () => Response;
let put: () => Response;
let reload: ReturnType<typeof vi.fn>;

const server = (storageMode: "local" | "cloud", chosen: boolean, inUse: boolean) => () =>
  Response.json({ storageMode, chosen, inUse });
const NEW_USER = server("local", false, false);

beforeEach(async () => {
  localStorage.clear();
  __resetAccountForTests();
  await activateAccount("u-1");
  puts.length = 0;
  status = NEW_USER;
  put = () => Response.json({ ok: true });
  uploadAllToCloud.mockReset().mockResolvedValue(undefined);
  downloadAllFromCloud.mockReset().mockResolvedValue(undefined);
  reload = vi.fn();
  vi.stubGlobal("location", { reload, href: "" } as unknown as Location);
  vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
    if ((init?.method ?? "GET") === "GET") return status();
    puts.push(JSON.parse(String(init?.body)));
    return put();
  });
});
afterEach(() => vi.unstubAllGlobals());

async function open() {
  await act(async () => {
    render(
      <StorageChoiceGate>
        <div>앱 콘텐츠</div>
      </StorageChoiceGate>
    );
  });
}
const option = (name: RegExp) => screen.getByRole("radio", { name });
const LOCAL = /이 기기에만 저장/;
const CLOUD = /클라우드에 저장/;
const submit = () => screen.getByRole("button", { name: "이대로 시작하기" });
const choose = async (name: RegExp) => {
  fireEvent.click(option(name));
  await act(async () => fireEvent.click(submit()));
};
const deviceMode = () => localStorage.getItem(STORAGE_MODE_KEY);
const app = () => screen.queryByText("앱 콘텐츠");

describe("StorageChoiceGate", () => {
  it("opens the app when a mode was already chosen", async () => {
    status = server("local", true, true);
    await open();
    expect(app()).toBeInTheDocument();
  });

  it.each([
    ["the server fails", () => new Response(null, { status: 500 })],
    ["an older server answers", () => Response.json({ storageMode: "cloud" })],
  ])("opens the app and asks another time when %s", async (_, response) => {
    status = response;
    await open();
    expect(app()).toBeInTheDocument();
    expect(puts).toEqual([]);
  });

  describe("new user", () => {
    it("starts with nothing selected", async () => {
      await open();
      expect(app()).not.toBeInTheDocument();
      expect(option(LOCAL)).not.toBeChecked();
      expect(option(CLOUD)).not.toBeChecked();
      expect(submit()).toBeDisabled();
      expect(screen.queryByText("지금 방식")).not.toBeInTheDocument();
    });

    it("opens the app after choosing this device, without merging", async () => {
      await open();
      await choose(LOCAL);
      expect(puts).toEqual([{ storageMode: "local", onlyIfUnchosen: true }]);
      expect(downloadAllFromCloud).not.toHaveBeenCalled();
      expect(reload).not.toHaveBeenCalled();
      expect(app()).toBeInTheDocument();
    });

    it("switches to the cloud and reloads", async () => {
      await open();
      await choose(CLOUD);
      expect(puts).toEqual([{ storageMode: "cloud", onlyIfUnchosen: true }]);
      expect(deviceMode()).toBe("cloud");
      expect(reload).toHaveBeenCalledTimes(1);
    });
  });

  describe("existing user", () => {
    it.each([
      ["local", LOCAL, CLOUD],
      ["cloud", CLOUD, LOCAL],
    ] as const)("marks %s as the current mode", async (mode, current, other) => {
      status = server(mode, false, true);
      await open();
      expect(option(current)).toBeChecked();
      expect(option(other)).not.toBeChecked();
      expect(screen.getByText("지금 방식")).toBeInTheDocument();
    });

    it("shows the account's mode on a new device, not the device's default", async () => {
      status = server("cloud", false, true);
      await open();
      expect(deviceMode()).toBeNull();
      expect(option(CLOUD)).toBeChecked();
    });

    it.each([
      ["local", LOCAL],
      ["cloud", CLOUD],
    ] as const)("keeps %s without switching or merging", async (mode, current) => {
      status = server(mode, false, true);
      await open();
      await choose(current);
      expect(puts).toEqual([{ storageMode: mode, onlyIfUnchosen: true }]);
      expect(uploadAllToCloud).not.toHaveBeenCalled();
      expect(downloadAllFromCloud).not.toHaveBeenCalled();
      expect(deviceMode()).toBeNull();
      expect(reload).not.toHaveBeenCalled();
      expect(app()).toBeInTheDocument();
    });

    it("explains merging only when the other mode is selected", async () => {
      status = server("local", false, true);
      await open();
      expect(screen.queryByText(/합쳐/)).not.toBeInTheDocument();
      fireEvent.click(option(CLOUD));
      expect(screen.getByText(/합쳐/)).toBeInTheDocument();
    });

    it("merges into the cloud before switching", async () => {
      status = server("local", false, true);
      await open();
      await choose(CLOUD);
      expect(uploadAllToCloud).toHaveBeenCalledTimes(1);
      expect(deviceMode()).toBe("cloud");
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it("brings the cloud data here before switching to this device", async () => {
      status = server("cloud", false, true);
      localStorage.setItem(STORAGE_MODE_KEY, "cloud");
      await open();
      await choose(LOCAL);
      expect(downloadAllFromCloud).toHaveBeenCalledTimes(1);
      expect(deviceMode()).toBe("local");
      expect(reload).toHaveBeenCalledTimes(1);
    });
  });

  it("changes nothing when merging fails, and can be retried", async () => {
    status = server("local", false, true);
    uploadAllToCloud.mockRejectedValueOnce(new Error("offline"));
    await open();
    await choose(CLOUD);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(puts).toEqual([]);
    expect(deviceMode()).toBeNull();

    await act(async () => fireEvent.click(submit()));
    expect(deviceMode()).toBe("cloud");
  });

  it("keeps the device's mode when the choice could not be saved", async () => {
    put = () => new Response(null, { status: 500 });
    await open();
    await choose(CLOUD);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(deviceMode()).toBeNull();
    expect(reload).not.toHaveBeenCalled();
    expect(app()).not.toBeInTheDocument();
  });

  it("does not reload when this device could not save the mode", async () => {
    await open();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    await choose(CLOUD);
    vi.restoreAllMocks();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads to follow a choice made meanwhile on another device", async () => {
    put = () => new Response(null, { status: 409 });
    await open();
    await choose(LOCAL);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(deviceMode()).toBeNull();
  });
});
