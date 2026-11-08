/**
 * @file ui:app-screen
 * @requires @seed-design/react@^2.0.0 || ^3.0.0
 **/

"use client";

import { forwardRef, useCallback, useRef } from "react";
import { AppScreen as SeedAppScreen } from "@seed-design/stackflow";
import { useActivity, useFlow } from "@stackflow/react";
import { isIOSUserAgent } from "@web/lib/pwa-install";
import { OverlayContainerContext } from "./overlay-container";
import { PullToRefreshContent, PullToRefreshIndicator, PullToRefreshRoot } from "./pull-to-refresh";

function hasNativeSwipeBack(): boolean {
  return (
    typeof navigator !== "undefined" &&
    isIOSUserAgent(navigator.userAgent, navigator.maxTouchPoints)
  );
}

export interface AppScreenProps extends Omit<SeedAppScreen.RootProps, "asChild"> {
  preventSwipeBack?: boolean;
}

export const AppScreen = forwardRef<HTMLDivElement, AppScreenProps>(
  ({ children, onSwipeBackEnd, preventSwipeBack, ...otherProps }, ref) => {
    const { pop } = useFlow();
    const { isRoot } = useActivity();
    // iOS (Safari·PWA) 는 OS 가 가장자리 스와이프로 뒤로가기를 한다. 앱 스와이프까지 켜 두면
    // 한 제스처에 두 경로가 동시에 반응해 스택이 두 번 pop 되거나(touchend) 화면이 되돌아왔다가
    // 다시 나간다(touchcancel). OS 제스처 하나로 통일한다 (native-back-gesture-plugin.ts).
    const shouldSwipeBack = !isRoot && !preventSwipeBack && !hasNativeSwipeBack();

    // 화면 안 바텀시트·다이얼로그를 이 루트로 portal 한다 (overlay-container.tsx).
    const rootRef = useRef<HTMLDivElement | null>(null);
    const setRootRef = useCallback(
      (node: HTMLDivElement | null) => {
        rootRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      },
      [ref]
    );

    return (
      <SeedAppScreen.Root
        ref={setRootRef}
        onSwipeBackEnd={({ swiped }) => {
          if (swiped) {
            pop();
          }
          onSwipeBackEnd?.({ swiped });
        }}
        {...otherProps}
        style={{
          // portal 된 시트·다이얼로그(z-index = 2 + --layer-index)가 이 화면의 앱바
          // (--z-index-base + 7)와 하단 탭바 위에 오도록 기본 layer-index 를 올린다.
          // layerIndex 를 직접 준 시트는 자기 값으로 덮어쓴다.
          ["--layer-index" as string]: "calc(var(--z-index-base) + 8)",
          ...otherProps.style,
        }}
      >
        <SeedAppScreen.Dim />
        <OverlayContainerContext.Provider value={rootRef}>
          {children}
        </OverlayContainerContext.Provider>
        {shouldSwipeBack && <SeedAppScreen.Edge />}
      </SeedAppScreen.Root>
    );
  }
);
AppScreen.displayName = "AppScreen";

export interface AppScreenContentProps extends Omit<SeedAppScreen.LayerProps, "asChild"> {
  ptr?: boolean;

  onPtrReady?: () => void;

  onPtrRefresh?: () => Promise<void>;
}

export const AppScreenContent = forwardRef<HTMLDivElement, AppScreenContentProps>(
  ({ children, ptr, onPtrReady, onPtrRefresh, ...otherProps }, ref) => {
    if (!ptr) {
      return (
        <SeedAppScreen.Layer ref={ref} {...otherProps}>
          {children}
        </SeedAppScreen.Layer>
      );
    }

    return (
      <PullToRefreshRoot asChild onPtrReady={onPtrReady} onPtrRefresh={onPtrRefresh}>
        <SeedAppScreen.Layer ref={ref} {...otherProps}>
          <PullToRefreshIndicator />
          <PullToRefreshContent asChild>{children}</PullToRefreshContent>
        </SeedAppScreen.Layer>
      </PullToRefreshRoot>
    );
  }
);

/**
 * This file is a snippet from SEED Design, helping you get started quickly with @seed-design/* packages.
 * You can extend this snippet however you want.
 */
