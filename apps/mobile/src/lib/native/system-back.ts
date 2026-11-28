"use client";

import { COVER_SELECTOR, isOverlayOpen } from "./overlay";

/**
 * Android 시스템 뒤로가기 (Capacitor `App`). 열린 시트·다이얼로그 닫기 → 스택 한 화면 뒤로 →
 * 루트(로그인 화면 포함)에서는 앱을 내린다.
 *
 * 웹이 앱보다 먼저 배포되므로 플러그인이 없는 구버전 앱·브라우저·iOS 에서는 아무것도 하지 않는다.
 * 다른 문서(약관, 카카오 로그인)로 넘어가면 앱 셸이 리스너를 지우고 WebView 뒤로가기로 동작한다.
 */
export interface AppPlugin {
  addListener(
    event: "backButton",
    listener: () => void
  ): Promise<{ remove: () => Promise<unknown> }>;
  minimizeApp(): Promise<unknown>;
  toggleBackButtonHandler(options: { enabled: boolean }): Promise<unknown>;
}

interface SystemBackDeps {
  isAvailable: () => boolean;
  /** 플러그인 Proxy 는 `.then` 도 네이티브 호출로 바꾼다 — 객체로 감싸서 넘긴다. */
  loadPlugin: () => Promise<{ plugin: AppPlugin } | null>;
}

export function createSystemBack({ isAvailable, loadPlugin }: SystemBackDeps) {
  // 화면 스택이 떠 있는 동안의 "한 화면 뒤로". 루트라 갈 곳이 없으면 false.
  let screenBack: (() => boolean) | null = null;

  function handleBack(plugin: AppPlugin) {
    // 앱 잠금 아래의 화면은 건드리지 않는다.
    const locked = document.querySelector(COVER_SELECTOR) !== null;
    if (!locked) {
      if (isOverlayOpen()) {
        // SEED 시트·다이얼로그는 Escape 로 맨 위 하나만 닫힌다 (닫지 못하게 한 것은 그대로 남는다).
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        return;
      }
      if (screenBack?.()) return;
    }
    void plugin.minimizeApp().catch(() => {});
  }

  async function listen(isStopped: () => boolean) {
    const loaded = await loadPlugin();
    if (!loaded || isStopped()) return null;
    const { plugin } = loaded;
    const handle = await plugin.addListener("backButton", () => handleBack(plugin));
    if (isStopped()) void handle.remove();
    // 앱은 꺼진 채로 시작한다 (capacitor.config.ts) — 웹이 못 뜬 화면에서도 뒤로가기가 먹게.
    else await plugin.toggleBackButtonHandler({ enabled: true });
    return handle;
  }

  return {
    /** 리스너를 건다. 돌려준 함수를 부르면 뗀다. */
    start(): () => void {
      if (!isAvailable()) return () => {};
      let stopped = false;
      const listening = listen(() => stopped).catch(() => null);
      return () => {
        stopped = true;
        void listening.then((handle) => handle?.remove());
      };
    },
    setScreenBack(goBack: () => boolean): () => void {
      screenBack = goBack;
      return () => {
        if (screenBack === goBack) screenBack = null;
      };
    },
  };
}

interface CapacitorGlobal {
  getPlatform?: () => string;
  isPluginAvailable?: (name: string) => boolean;
}

export const systemBack = createSystemBack({
  isAvailable: () => {
    const capacitor = (window as Window & { Capacitor?: CapacitorGlobal }).Capacitor;
    return (
      capacitor?.getPlatform?.() === "android" && capacitor.isPluginAvailable?.("App") === true
    );
  },
  loadPlugin: async () => {
    const { App } = await import("@capacitor/app");
    return { plugin: App };
  },
});
