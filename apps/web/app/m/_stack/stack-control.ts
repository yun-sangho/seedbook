import { id, type StackflowActions } from "@stackflow/core";
import type { StackflowReactPlugin } from "@stackflow/react";
import { type TabKey, tabParams } from "./tabs";

/**
 * 화면 밖(탭바·시스템 뒤로가기·계정 전환)에서 스택을 다루는 함수들. 스택 설정(`stackflow.ts`)은
 * 화면들을 import 하므로, 화면에서도 쓸 수 있게 여기서는 스택을 import 하지 않는다.
 */
let actions: StackflowActions | null = null;

export const stackControlPlugin: StackflowReactPlugin = () => ({
  key: "stack-control",
  onInit: (args) => {
    actions = args.actions;
  },
});

/** 루트 위에 쌓인 화면 수. 나가는 중인 화면은 세지 않는다. */
function depthAboveRoot(current: StackflowActions): number {
  return current.getStack().activities.filter((activity) => !activity.exitedBy).length - 1;
}

function popToRoot(current: StackflowActions, options: { animate: boolean }) {
  for (let left = depthAboveRoot(current); left > 0; left -= 1) {
    // 맨 위 화면만 움직이며 나가고, 그 아래 화면은 바로 사라진다.
    current.pop({ skipExitActiveState: !options.animate || left > 1 });
  }
}

function showTab(current: StackflowActions, tab: TabKey) {
  current.stepReplace({ stepId: id(), stepParams: tabParams(tab) });
}

/**
 * 하단 탭 전환. 탭 화면 4개는 루트 화면(`Tabs`) 하나 안에 살아 있고 여기서는 보일 탭만 바꾼다 —
 * 브라우저 히스토리에 쌓이지 않는다. 상세 화면에서 부르면 루트로 돌아가며 바꾼다.
 */
export function switchTab(tab: TabKey) {
  if (!actions) return;
  popToRoot(actions, { animate: true });
  showTab(actions, tab);
}

// 루트 화면 안에서 먼저 되돌릴 것 (정원 홈의 식물 포커스 등). 되돌렸으면 true.
let rootBack: (() => boolean) | null = null;

/**
 * 루트에서 뒤로가기를 받을 함수를 건다 — 스택에 쌓인 화면이 없을 때만 불린다. 돌려준 함수를 부르면
 * 뗀다. 화면 안의 상태(포커스)는 브라우저 히스토리나 스택 화면으로 두지 않고 여기로 되돌린다.
 */
export function setRootBack(handler: () => boolean): () => void {
  rootBack = handler;
  return () => {
    if (rootBack === handler) rootBack = null;
  };
}

/** 한 화면 뒤로. 루트면 루트 화면이 되돌릴 것을 되돌리고, 그것도 없으면 false. */
export function goBack(): boolean {
  if (actions && depthAboveRoot(actions) > 0) {
    actions.pop();
    return true;
  }
  return rootBack?.() ?? false;
}

let accountId: string | null = null;

/** 스택이 다른 계정이 보던 화면을 들고 있는지. 스택은 로그인 화면이 떠 있는 동안에도 남는다. */
export function isStackOfOtherAccount(userId: string | null): boolean {
  return accountId !== null && accountId !== userId;
}

/** 스택을 이 계정의 것으로 한다. 다른 계정이 보던 화면이 남아 있으면 홈 탭으로 되돌린다. */
export function bindStackToAccount(userId: string | null) {
  if (actions && isStackOfOtherAccount(userId)) {
    popToRoot(actions, { animate: false });
    showTab(actions, "home");
  }
  accountId = userId;
}
