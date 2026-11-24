import { fireEvent, render, screen } from "@testing-library/react";
import type { TabBarItem } from "@web/lib/native/tab-bar";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppTabBar } from "./app-tab-bar";

const ITEMS: TabBarItem[] = [
  { key: "home", label: "홈", icon: "house" },
  { key: "accounts", label: "계좌", icon: "linechart" },
  { key: "more", label: "더보기", icon: "more", action: true },
];

function renderBar(onSelect = vi.fn()) {
  render(<AppTabBar items={ITEMS} current="home" active onSelect={onSelect} />);
  return onSelect;
}

afterEach(() => {
  delete (window as { Capacitor?: unknown }).Capacitor;
});

describe("AppTabBar", () => {
  it("draws the web tab bar in a browser and marks the current tab", () => {
    renderBar();

    expect(screen.getByRole("button", { current: "page" }).textContent).toBe("홈");
  });

  it("reports the tapped item but not the current tab", () => {
    const onSelect = renderBar();

    fireEvent.click(screen.getByRole("button", { name: "홈" }));
    fireEvent.click(screen.getByRole("button", { name: "더보기" }));

    expect(onSelect.mock.calls).toEqual([["more"]]);
  });

  it("draws the web tab bar in an app build without the plugin", () => {
    (window as { Capacitor?: unknown }).Capacitor = {
      isNativePlatform: () => true,
      isPluginAvailable: () => false,
    };

    renderBar();

    expect(screen.queryByRole("navigation")).not.toBeNull();
  });

  it("leaves the bar to the app when the native tab bar is available", () => {
    (window as { Capacitor?: unknown }).Capacitor = {
      isNativePlatform: () => true,
      isPluginAvailable: (name: string) => name === "SeedbookTabBar",
    };

    renderBar();

    expect(screen.queryByRole("navigation")).toBeNull();
  });
});
