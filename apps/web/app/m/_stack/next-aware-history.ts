import { createMemoryHistory, type History } from "history";

/**
 * Stackflow history sync 가 쓸 history. 모바일 (`/m`) 은 브라우저 history 를 쌓지 않는
 * 단일 페이지로 동작한다.
 *
 * 왜 메모리 history 인가: 브라우저 history 에 이전 항목이 있으면 iOS(Safari·PWA)는 가장자리
 * 스와이프를 OS 가 가로채 자체 애니메이션으로 뒤로가기를 한다. 그러면 SEED 스와이프와
 * 겹치고, history sync 가 진입 애니메이션이 끝난 뒤에 pushState 해서 OS 가 "이전 화면"
 * 캡처로 현재 화면을 보여주는 등 스택이 어긋난다. 브라우저 history 항목을 아예 만들지
 * 않으면 OS 제스처는 동작하지 않고, 화면 전환·스와이프는 SEED(`AppScreen`) 하나로 통일된다.
 * Android 의 시스템 뒤로가기도 스택을 pop 하지 않는다 (앱 안 뒤로 버튼·스와이프만 사용).
 *
 * 스택 URL 은 주소창에 replaceState 로만 반영한다 — 항목은 늘지 않고, 새로고침·재실행하면
 * 같은 화면(상세는 route 의 defaultHistory 로 목록 위에)으로 열린다.
 *
 * Next App Router 는 window.history 를 패치해 replaceState 마다 라우터 상태를 갱신한다.
 * history sync 는 `<Stack>` 의 첫 렌더 도중(onInit)에 history 를 기록하므로, 그때 반영하면
 * 렌더 중 Router 를 setState 하게 되어 React 경고("Cannot update a component while
 * rendering")가 난다. 첫 커밋 전까지는 Next 내부 state(`__NA`, 트리)를 복사해 넘겨 Next
 * 패치가 라우터 갱신 없이 통과시키게 한다. 첫 커밋 뒤(`startNextRouterSync`)에는 Next 패치가
 * 평소대로 state 를 복사하고 URL 을 반영한다.
 */
let initialRender = true;

export function startNextRouterSync() {
  initialRender = false;
}

function nextInternalState(): Record<string, unknown> {
  const current = window.history.state as Record<string, unknown> | null;
  if (!current?.__NA) return {};
  return {
    __NA: current.__NA,
    __PRIVATE_NEXTJS_INTERNALS_TREE: current.__PRIVATE_NEXTJS_INTERNALS_TREE,
  };
}

function currentBrowserPath(): string {
  const { pathname, search, hash } = window.location;
  return `${pathname}${search}${hash}`;
}

export function createNextAwareHistory(): History {
  const history = createMemoryHistory({ initialEntries: [currentBrowserPath()] });

  history.listen(({ location }) => {
    const path = `${location.pathname}${location.search}${location.hash}`;
    if (path === currentBrowserPath()) return;
    window.history.replaceState(initialRender ? nextInternalState() : {}, "", path);
  });

  return history;
}
