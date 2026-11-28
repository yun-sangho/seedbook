import { createMemoryHistory, type History } from "history";

/**
 * Stackflow history sync 가 쓸 history. 앱은 브라우저 history 를 쌓지 않는 단일 페이지로 동작한다.
 *
 * 왜 메모리 history 인가: 브라우저 history 에 이전 항목이 있으면 iOS(Safari·PWA)는 가장자리
 * 스와이프를 OS 가 가로채 자체 애니메이션으로 뒤로가기를 한다. 그러면 SEED 스와이프와
 * 겹치고, history sync 가 진입 애니메이션이 끝난 뒤에 pushState 해서 OS 가 "이전 화면"
 * 캡처로 현재 화면을 보여주는 등 스택이 어긋난다. 브라우저 history 항목을 아예 만들지
 * 않으면 OS 제스처는 동작하지 않고, 화면 전환·스와이프는 SEED(`AppScreen`) 하나로 통일된다.
 * 브라우저의 뒤로도 스택을 pop 하지 않는다. Android 앱의 시스템 뒤로가기는 네이티브가
 * 알려 주어 스택을 pop 한다 (lib/native/system-back.ts).
 *
 * 스택 URL 은 주소창에 replaceState 로만 반영한다 — 항목은 늘지 않고, 새로고침·재실행하면
 * 같은 화면(상세는 route 의 defaultHistory 로 목록 위에)으로 열린다.
 */
function currentBrowserPath(): string {
  const { pathname, search, hash } = window.location;
  return `${pathname}${search}${hash}`;
}

export function createAddressBarHistory(): History {
  const history = createMemoryHistory({ initialEntries: [currentBrowserPath()] });

  history.listen(({ location }) => {
    const path = `${location.pathname}${location.search}${location.hash}`;
    if (path === currentBrowserPath()) return;
    window.history.replaceState({}, "", path);
  });

  return history;
}
