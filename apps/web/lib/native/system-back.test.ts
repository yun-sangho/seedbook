import { afterEach, describe, expect, it, vi } from "vitest";
import { type AppPlugin, createSystemBack } from "./system-back";

function createFakeApp() {
  let onBack: (() => void) | null = null;
  const fake = {
    minimized: 0,
    enabled: false,
    listening: () => onBack !== null,
    back: () => onBack?.(),
  };
  const plugin: AppPlugin = {
    addListener: async (_event, listener) => {
      onBack = listener;
      return {
        remove: async () => {
          onBack = null;
        },
      };
    },
    minimizeApp: async () => {
      fake.minimized += 1;
    },
    toggleBackButtonHandler: async ({ enabled }) => {
      fake.enabled = enabled;
    },
  };
  return Object.assign(fake, { plugin });
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function setup(app = createFakeApp()) {
  const back = createSystemBack({
    isAvailable: () => true,
    loadPlugin: async () => ({ plugin: app.plugin }),
  });
  const stop = back.start();
  await settle();
  return { back, app, stop };
}

/** 열린 시트 대역: SEED 처럼 document 의 Escape 로 닫힌다. */
function openSheet(attributes: Record<string, string>) {
  const el = document.createElement("div");
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  document.body.append(el);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    el.remove();
    document.removeEventListener("keydown", onKeyDown);
  };
  document.addEventListener("keydown", onKeyDown);
  return el;
}

afterEach(() => document.body.replaceChildren());

describe("system back", () => {
  it("takes over the back button once it is listening", async () => {
    const { app } = await setup();

    expect(app.enabled).toBe(true);
  });

  it.each([
    ["a bottom sheet", { role: "dialog", "data-open": "" }],
    ["an alert dialog", { role: "alertdialog", "data-open": "" }],
  ])("closes %s first and leaves the stack alone", async (_name, attributes) => {
    const { back, app } = await setup();
    const goBack = vi.fn(() => true);
    back.setScreenBack(goBack);
    const sheet = openSheet(attributes);

    app.back();

    expect(sheet.isConnected).toBe(false);
    expect(goBack).not.toHaveBeenCalled();
    expect(app.minimized).toBe(0);
  });

  it("goes back one screen when no sheet is open", async () => {
    const { back, app } = await setup();
    const goBack = vi.fn(() => true);
    back.setScreenBack(goBack);

    app.back();

    expect(goBack).toHaveBeenCalledTimes(1);
    expect(app.minimized).toBe(0);
  });

  it("does not treat a sheet that is already closing as open", async () => {
    const { back, app } = await setup();
    const goBack = vi.fn(() => true);
    back.setScreenBack(goBack);
    openSheet({ role: "dialog" });

    app.back();

    expect(goBack).toHaveBeenCalledTimes(1);
  });

  it("minimizes the app at the root", async () => {
    const { back, app } = await setup();
    back.setScreenBack(() => false);

    app.back();

    expect(app.minimized).toBe(1);
  });

  it("minimizes the app when there is no screen stack (login)", async () => {
    const { back, app } = await setup();
    const release = back.setScreenBack(() => true);
    release();

    app.back();

    expect(app.minimized).toBe(1);
  });

  it("minimizes the app instead of moving the screens behind the app lock", async () => {
    const { back, app } = await setup();
    const goBack = vi.fn(() => true);
    back.setScreenBack(goBack);
    openSheet({ role: "dialog", "data-open": "" });
    const lock = document.createElement("div");
    lock.setAttribute("data-covers-tab-bar", "");
    document.body.append(lock);

    app.back();

    expect(goBack).not.toHaveBeenCalled();
    expect(document.querySelector("[data-open]")).not.toBeNull();
    expect(app.minimized).toBe(1);
  });

  it("stops listening when stopped, even before the plugin has loaded", async () => {
    const app = createFakeApp();
    const back = createSystemBack({
      isAvailable: () => true,
      loadPlugin: async () => ({ plugin: app.plugin }),
    });

    back.start()();
    await settle();

    expect(app.listening()).toBe(false);
  });
});

describe("app builds without the plugin", () => {
  it("does nothing when the plugin is missing", async () => {
    const loadPlugin = vi.fn(async () => null);
    const back = createSystemBack({ isAvailable: () => false, loadPlugin });

    expect(() => back.start()()).not.toThrow();
    expect(loadPlugin).not.toHaveBeenCalled();
  });

  it("survives a plugin that fails to start", async () => {
    const back = createSystemBack({
      isAvailable: () => true,
      loadPlugin: () => Promise.reject(new Error("boom")),
    });

    back.start();
    await settle();
  });
});
