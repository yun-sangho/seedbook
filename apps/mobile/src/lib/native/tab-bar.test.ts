import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createNativeTabBar,
  type NativeTabBarPlugin,
  type NativeTabBarState,
  type TabBarItem,
} from "./tab-bar";

const ITEMS: TabBarItem[] = [
  { key: "home", label: "홈", icon: "house" },
  { key: "accounts", label: "계좌", icon: "linechart" },
  { key: "more", label: "더보기", icon: "more", action: true },
];

/** 네이티브 탭바 대역: 마지막으로 받은 상태를 들고 있고, 사용자의 탭을 흉내 낸다. */
function createFakePlugin({ height = 83 } = {}) {
  let onTabSelect: (event: { key: string }) => void = () => {};
  const fake = {
    items: [] as TabBarItem[],
    state: null as NativeTabBarState | null,
    states: [] as NativeTabBarState[],
    height,
    tap: (key: string) => onTabSelect({ key }),
  };
  const plugin: NativeTabBarPlugin = {
    configure: async ({ items }) => {
      fake.items = items;
    },
    setState: async (state) => {
      fake.state = state;
      fake.states.push(state);
      return { height: fake.height };
    },
    addListener: async (_event, listener) => {
      onTabSelect = listener;
    },
  };
  return Object.assign(fake, { plugin });
}

/** 대기 중인 마이크로태스크와 MutationObserver 콜백을 모두 흘려보낸다. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const cleanups: (() => void)[] = [];

function setup(fake = createFakePlugin()) {
  const bar = createNativeTabBar({
    isAvailable: () => true,
    loadPlugin: async () => ({ plugin: fake.plugin }),
  });
  cleanups.push(bar.dispose);
  return { bar, fake };
}

function addOverlay(attributes: Record<string, string>) {
  const el = document.createElement("div");
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  document.body.append(el);
  return el;
}

beforeEach(() => {
  document.body.replaceChildren();
  document.documentElement.removeAttribute("style");
  document.documentElement.setAttribute("data-seed-user-color-scheme", "light");
});

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

describe("native tab bar mode", () => {
  it("is web when the app build has no tab bar plugin", () => {
    const bar = createNativeTabBar({ isAvailable: () => false, loadPlugin: async () => null });

    expect(bar.getMode()).toBe("web");
  });

  it("is native when the plugin is available", () => {
    expect(setup().bar.getMode()).toBe("native");
  });

  it("falls back to web and notifies subscribers when the plugin fails to start", async () => {
    const fake = createFakePlugin();
    const plugin = { ...fake.plugin, configure: () => Promise.reject(new Error("boom")) };
    const bar = createNativeTabBar({
      isAvailable: () => true,
      loadPlugin: async () => ({ plugin }),
    });
    cleanups.push(bar.dispose);
    const onChange = vi.fn();
    bar.subscribe(onChange);

    bar.show({ items: ITEMS, selected: "home", onSelect: () => {} });
    await settle();

    expect(bar.getMode()).toBe("web");
    expect(onChange).toHaveBeenCalled();
  });
});

describe("native tab bar visibility", () => {
  it("shows the bar with the tab of the current screen", async () => {
    const { bar, fake } = setup();

    bar.show({ items: ITEMS, selected: "accounts", onSelect: () => {} });
    await settle();

    expect(fake.items).toEqual(ITEMS);
    expect(fake.state).toEqual({ selected: "accounts", visible: true, dark: false });
  });

  it("hides the bar when the tab screen is covered or unmounted", async () => {
    const { bar, fake } = setup();
    const release = bar.show({ items: ITEMS, selected: "home", onSelect: () => {} });
    await settle();

    release();
    await settle();

    expect(fake.state?.visible).toBe(false);
  });

  it("does not flash hidden while one tab screen replaces another", async () => {
    const { bar, fake } = setup();
    const releaseHome = bar.show({ items: ITEMS, selected: "home", onSelect: () => {} });
    await settle();

    releaseHome();
    bar.show({ items: ITEMS, selected: "accounts", onSelect: () => {} });
    await settle();

    expect(fake.states.map((s) => [s.selected, s.visible])).toEqual([
      ["home", true],
      ["accounts", true],
    ]);
  });

  it("keeps the new tab when the old screen is released after it", async () => {
    const { bar, fake } = setup();
    const releaseHome = bar.show({ items: ITEMS, selected: "home", onSelect: () => {} });
    bar.show({ items: ITEMS, selected: "accounts", onSelect: () => {} });

    releaseHome();
    await settle();

    expect(fake.state).toMatchObject({ selected: "accounts", visible: true });
  });

  it.each([
    ["a bottom sheet", { role: "dialog", "data-open": "" }],
    ["an alert dialog", { role: "alertdialog", "data-open": "" }],
    ["the app lock screen", { role: "dialog", "data-covers-tab-bar": "" }],
  ])("hides the bar while %s is open", async (_name, attributes) => {
    const { bar, fake } = setup();
    bar.show({ items: ITEMS, selected: "home", onSelect: () => {} });
    await settle();

    const overlay = addOverlay(attributes);
    await settle();
    expect(fake.state?.visible).toBe(false);

    overlay.remove();
    await settle();
    expect(fake.state?.visible).toBe(true);
  });

  it("shows the bar again when a sheet starts closing", async () => {
    const { bar, fake } = setup();
    const sheet = addOverlay({ role: "dialog", "data-open": "" });
    bar.show({ items: ITEMS, selected: "home", onSelect: () => {} });
    await settle();
    expect(fake.state?.visible ?? false).toBe(false);

    sheet.removeAttribute("data-open");
    await settle();

    expect(fake.state?.visible).toBe(true);
  });
});

describe("native tab bar selection", () => {
  it("reports taps to the screen that is on top", async () => {
    const { bar, fake } = setup();
    const onHome = vi.fn();
    const onAccounts = vi.fn();
    const releaseHome = bar.show({ items: ITEMS, selected: "home", onSelect: onHome });
    releaseHome();
    bar.show({ items: ITEMS, selected: "accounts", onSelect: onAccounts });
    await settle();

    fake.tap("more");

    expect(onAccounts).toHaveBeenCalledWith("more");
    expect(onHome).not.toHaveBeenCalled();
  });

  it("ignores taps that arrive after the tab screen is gone", async () => {
    const { bar, fake } = setup();
    const onSelect = vi.fn();
    const release = bar.show({ items: ITEMS, selected: "home", onSelect });
    await settle();
    release();

    fake.tap("accounts");

    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("native tab bar appearance", () => {
  it("follows the color scheme of the web screens", async () => {
    const { bar, fake } = setup();
    bar.show({ items: ITEMS, selected: "home", onSelect: () => {} });
    await settle();

    document.documentElement.setAttribute("data-seed-user-color-scheme", "dark");
    await settle();

    expect(fake.state?.dark).toBe(true);
  });

  it("tells the web how much space the bar covers", async () => {
    const { bar } = setup(createFakePlugin({ height: 91 }));

    bar.show({ items: ITEMS, selected: "home", onSelect: () => {} });
    await settle();

    expect(document.documentElement.style.getPropertyValue("--app-tab-bar-inset")).toBe("91px");
  });

  it("measures the bar again when the window size changes", async () => {
    const { bar, fake } = setup();
    bar.show({ items: ITEMS, selected: "home", onSelect: () => {} });
    await settle();

    fake.height = 70;
    window.dispatchEvent(new Event("resize"));
    await settle();

    expect(document.documentElement.style.getPropertyValue("--app-tab-bar-inset")).toBe("70px");
  });
});
