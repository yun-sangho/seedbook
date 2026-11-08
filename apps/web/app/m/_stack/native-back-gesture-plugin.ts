import type { StackflowReactPlugin } from "@stackflow/react";

/**
 * iOS (Safari·홈 화면 PWA 모두) 는 화면 가장자리 스와이프를 OS 가 가로채서 자체 스냅샷
 * 애니메이션으로 뒤로/앞으로 가기를 하고, 끝난 뒤에야 `popstate` 를 보낸다. history sync 는
 * 이 popstate 를 받아 평소처럼 애니메이션 있는 pop/push 를 하므로, 이미 이전 화면이 보인
 * 뒤에 방금 떠난 화면이 다시 나타났다가 밀려나는 "화면이 한 번 더 보이는" 현상이 생긴다.
 *
 * 브라우저 history 이동(popstate) 으로 생긴 pop/push 는 OS 가 이미 전환을 보여줬으므로
 * 애니메이션 단계(exit-active / enter-active)를 건너뛴다. 앱 안 뒤로 버튼(`pop()`)은
 * popstate 리스너 밖에서 스택을 바꾸므로 영향받지 않는다.
 */

/** history sync 가 브라우저 popstate 를 처리하는 동안(동기 구간)만 true. */
let handlingBrowserPop = false;

/**
 * history 라이브러리의 popstate 리스너를 감싼다. history sync 는 이 리스너 안에서 동기적으로
 * pop/push 를 호출하므로, 그 구간에 일어난 스택 변경 = 브라우저(OS 제스처) 이동이다.
 * 다른 popstate 리스너와의 등록 순서에 기대지 않기 위해 리스너 자체를 감싼다.
 */
export function withBrowserPopFlag(listener: (event: PopStateEvent) => void) {
  return (event: PopStateEvent) => {
    handlingBrowserPop = true;
    try {
      listener(event);
    } finally {
      handlingBrowserPop = false;
    }
  };
}

export function nativeBackGesturePlugin({
  enabled,
}: {
  enabled: () => boolean;
}): StackflowReactPlugin {
  return () => ({
    key: "native-back-gesture",
    onBeforePop({ actionParams, actions }) {
      if (!handlingBrowserPop || !enabled()) return;
      actions.overrideActionParams({ ...actionParams, skipExitActiveState: true });
    },
    onBeforePush({ actionParams, actions }) {
      if (!handlingBrowserPop || !enabled()) return;
      actions.overrideActionParams({ ...actionParams, skipEnterActiveState: true });
    },
  });
}
