"use client";

/**
 * 네이티브 하단 탭바 브리지 (Capacitor `SeedbookTabBar`, `packages/native-plugins`).
 *
 * 네이티브 쪽은 항목·선택·표시 상태를 그대로 그리고 누른 탭만 알려준다. 화면 전환은 웹이 한다.
 * 화면 구조(stackflow 등)를 모른다 — 탭 화면이 맨 위에 있는 동안 `show()` 를 부르고 아니면 놓는다.
 *
 * 브라우저·PWA·플러그인이 없는 구버전 앱에서는 `getMode()` 가 `"web"` 이라 웹이 탭바를 그린다
 * (`components/mobile/app-tab-bar.tsx`). 웹이 앱보다 먼저 배포되므로 이 갈래가 꼭 필요하다.
 *
 * 네이티브 탭바는 WebView 위에 있어 웹 시트·다이얼로그·잠금 화면을 가린다. 그것들이 열려 있는
 * 동안에는 내린다.
 */

/** 네이티브 아이콘 이름. 더하면 iOS·Android 플러그인과 app-tab-bar.tsx 의 ICONS 를 같이 고친다. */
export type TabIcon = "house" | "linechart" | "arrows" | "barchart" | "more";

export interface TabBarItem {
  key: string;
  label: string;
  icon: TabIcon;
  /** 탭을 바꾸지 않고 동작만 하는 항목 (더보기). 눌러도 선택 표시가 옮겨가지 않는다. */
  action?: boolean;
}

export interface NativeTabBarState {
  selected: string | null;
  visible: boolean;
  dark: boolean;
}

export interface NativeTabBarPlugin {
  configure(options: { items: TabBarItem[] }): Promise<unknown>;
  /** height: 탭바 윗변부터 화면 바닥까지 (CSS px, 바닥 safe area 포함). */
  setState(state: NativeTabBarState): Promise<{ height: number }>;
  addListener(event: "tabSelect", listener: (event: { key: string }) => void): Promise<unknown>;
}

export interface NativeTabBar {
  getMode(): "native" | "web";
  /** 모드가 바뀌면(네이티브 탭바를 띄우지 못해 웹으로) 부른다. */
  subscribe(listener: () => void): () => void;
  /** 탭 화면이 맨 위에 있다. 돌려준 함수를 부르면(가려지거나 언마운트) 탭바가 내려간다. */
  show(request: TabBarRequest): () => void;
  dispose(): void;
}

interface TabBarRequest {
  items: readonly TabBarItem[];
  selected: string;
  onSelect: (key: string) => void;
}

interface NativeTabBarDeps {
  isAvailable: () => boolean;
  /** 플러그인 Proxy 는 `.then` 도 네이티브 호출로 바꾼다 — 객체로 감싸서 넘긴다. */
  loadPlugin: () => Promise<{ plugin: NativeTabBarPlugin } | null>;
}

const PLUGIN_NAME = "SeedbookTabBar";
/** 네이티브 탭바가 가리는 높이. 웹 탭바일 때는 없다 (쓰는 쪽이 기본값을 준다). */
const INSET_VAR = "--app-tab-bar-inset";
/** SEED 시트·다이얼로그는 열려 있는 동안만 `data-open` 을 단다. SEED 가 아닌 전체 화면은 직접 표시한다. */
const COVER_ATTRIBUTE = "data-covers-tab-bar";
const OVERLAY_SELECTOR = `[role="dialog"][data-open], [role="alertdialog"][data-open], [${COVER_ATTRIBUTE}]`;
const COLOR_SCHEME_ATTRIBUTE = "data-seed-user-color-scheme";

export function createNativeTabBar({ isAvailable, loadPlugin }: NativeTabBarDeps): NativeTabBar {
  let failed = false;
  let start: Promise<NativeTabBarApi | null> | null = null;
  let flushQueued = false;
  let lastSelected: string | null = null;
  let lastSent = "";
  let stopWatching = () => {};
  const listeners = new Set<() => void>();
  // 탭 전환 중에는 이전·다음 화면이 잠깐 함께 있을 수 있다. 마지막에 들어온 화면이 주인이다.
  const requests = new Set<TabBarRequest>();

  const currentRequest = () => [...requests].at(-1);

  function fail() {
    failed = true;
    stopWatching();
    document.documentElement.style.removeProperty(INSET_VAR);
    for (const listener of listeners) listener();
  }

  async function startNative(items: readonly TabBarItem[]): Promise<NativeTabBarApi | null> {
    try {
      const loaded = await loadPlugin();
      if (!loaded) throw new Error(`${PLUGIN_NAME} is not available`);
      await loaded.plugin.configure({ items: [...items] });
      await loaded.plugin.addListener("tabSelect", ({ key }) => currentRequest()?.onSelect(key));
      return { setState: (state) => loaded.plugin.setState(state) };
    } catch {
      fail();
      return null;
    }
  }

  async function send() {
    const native = await start;
    if (!native || failed) return;
    const request = currentRequest();
    if (request) lastSelected = request.selected;
    const state: NativeTabBarState = {
      selected: lastSelected,
      visible: request !== undefined && document.querySelector(OVERLAY_SELECTOR) === null,
      dark: document.documentElement.getAttribute(COLOR_SCHEME_ATTRIBUTE) === "dark",
    };
    const signature = JSON.stringify(state);
    if (signature === lastSent) return;
    lastSent = signature;
    try {
      const { height } = await native.setState(state);
      if (height > 0 && !failed) {
        document.documentElement.style.setProperty(INSET_VAR, `${height}px`);
      }
    } catch {
      fail();
    }
  }

  /** 같은 틱의 변화(이전 탭 내림 + 새 탭 올림)를 하나로 합쳐 깜빡이지 않게 한다. */
  function queueSend() {
    if (flushQueued) return;
    flushQueued = true;
    queueMicrotask(() => {
      flushQueued = false;
      void send();
    });
  }

  function watch() {
    const observer = new MutationObserver(queueSend);
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-open", COVER_ATTRIBUTE, COLOR_SCHEME_ATTRIBUTE],
    });
    // 회전·화면 분할로 탭바 높이가 달라질 수 있다 — 같은 상태라도 다시 보내 높이를 받는다.
    const onResize = () => {
      lastSent = "";
      queueSend();
    };
    window.addEventListener("resize", onResize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }

  return {
    getMode: () => (!failed && isAvailable() ? "native" : "web"),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    show: (request) => {
      if (failed || !isAvailable()) return () => {};
      if (!start) {
        stopWatching = watch();
        start = startNative(request.items);
      }
      requests.add(request);
      queueSend();
      return () => {
        requests.delete(request);
        queueSend();
      };
    },
    dispose: () => stopWatching(),
  };
}

interface NativeTabBarApi {
  setState: NativeTabBarPlugin["setState"];
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  isPluginAvailable?: (name: string) => boolean;
}

/** 앱 셸이 주입한 전역으로 판정한다 (@capacitor/core 를 불러오기 전, 첫 렌더에서 바로 알아야 한다). */
function isNativeTabBarAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const capacitor = (window as Window & { Capacitor?: CapacitorGlobal }).Capacitor;
  return (
    capacitor?.isNativePlatform?.() === true && capacitor.isPluginAvailable?.(PLUGIN_NAME) === true
  );
}

export const nativeTabBar = createNativeTabBar({
  isAvailable: isNativeTabBarAvailable,
  loadPlugin: async () => {
    const { registerPlugin } = await import("@capacitor/core");
    return { plugin: registerPlugin<NativeTabBarPlugin>(PLUGIN_NAME) };
  },
});
