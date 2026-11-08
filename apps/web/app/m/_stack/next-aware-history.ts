import { createBrowserHistory, type History } from "history";
import { withBrowserPopFlag } from "./native-back-gesture-plugin";

/**
 * Stackflow history sync 가 쓸 브라우저 history.
 *
 * 문제: history sync 는 `<Stack>` 이 처음 렌더되는 도중(onInit)에 현재 스택을 history 에
 * 기록한다 (replaceState/pushState). Next App Router 는 window.history 를 패치해 두고
 * 외부 pushState/replaceState 마다 라우터 상태를 갱신하므로, 렌더 중 다른 컴포넌트(Router)
 * 를 setState 하게 되어 React 경고("Cannot update a component while rendering")가 난다.
 *
 * 해결: 첫 커밋 전까지는 기록할 state 에 Next 내부 state(`__NA`, 트리)를 미리 복사해 둔다.
 * Next 패치는 `__NA` 가 있는 호출을 자기 호출로 보고 라우터 갱신 없이 그대로 통과시킨다.
 * 초기 기록은 결국 지금 URL 로 끝나므로 Next 가 아는 URL 과 어긋나지 않고, 복사한 `__NA`
 * 덕분에 뒤로가기(popstate) 시에도 Next 가 페이지를 새로고침하지 않는다.
 * 첫 커밋 뒤(`startNextRouterSync`)에는 평소대로 Next 패치가 state 를 복사하고 URL 을 반영한다.
 */
let initialRender = true;

export function startNextRouterSync() {
  initialRender = false;
}

type HistoryData = Record<string, unknown> | null | undefined;

function withNextInternalState(data: HistoryData): HistoryData {
  const current = window.history.state as Record<string, unknown> | null;
  if (!current?.__NA) return data;
  return {
    ...data,
    __NA: current.__NA,
    __PRIVATE_NEXTJS_INTERNALS_TREE: current.__PRIVATE_NEXTJS_INTERNALS_TREE,
  };
}

/** 대상 객체의 메서드를 원래 객체에 묶어 돌려주는 프록시 (window.history 등 this 검사 대응). */
function bindingProxy<T extends object>(target: T, overrides: Partial<Record<keyof T, unknown>>) {
  return new Proxy(target, {
    get(obj, prop) {
      if (prop in overrides) return overrides[prop as keyof T];
      const value: unknown = Reflect.get(obj, prop, obj);
      return typeof value === "function" ? value.bind(obj) : value;
    },
  });
}

type PopListener = (event: PopStateEvent) => void;

export function createNextAwareHistory(): History {
  const nativeHistory = window.history;
  const historyProxy = bindingProxy(nativeHistory, {
    pushState: (data: HistoryData, unused: string, url?: string | URL | null) =>
      nativeHistory.pushState(initialRender ? withNextInternalState(data) : data, unused, url),
    replaceState: (data: HistoryData, unused: string, url?: string | URL | null) =>
      nativeHistory.replaceState(initialRender ? withNextInternalState(data) : data, unused, url),
  });

  // history 의 popstate 리스너를 감싸 OS 제스처 이동을 표시한다 (native-back-gesture-plugin.ts).
  const wrapped = new Map<PopListener, PopListener>();
  const addEventListener = (type: string, listener: PopListener, options?: unknown) => {
    if (type !== "popstate")
      return window.addEventListener(
        type,
        listener as EventListener,
        options as AddEventListenerOptions
      );
    const wrapper = wrapped.get(listener) ?? withBrowserPopFlag(listener);
    wrapped.set(listener, wrapper);
    window.addEventListener(type, wrapper as EventListener, options as AddEventListenerOptions);
  };
  const removeEventListener = (type: string, listener: PopListener, options?: unknown) => {
    const target = type === "popstate" ? (wrapped.get(listener) ?? listener) : listener;
    window.removeEventListener(type, target as EventListener, options as EventListenerOptions);
  };

  return createBrowserHistory({
    window: bindingProxy(window, { history: historyProxy, addEventListener, removeEventListener }),
  });
}
