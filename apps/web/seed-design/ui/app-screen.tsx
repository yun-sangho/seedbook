/**
 * @file ui:app-screen
 * @requires @seed-design/react@^2.0.0 || ^3.0.0
 **/

"use client";

import { forwardRef, useCallback, useRef } from "react";
import { AppScreen as SeedAppScreen } from "@seed-design/stackflow";
import { useActivity, useFlow } from "@stackflow/react";
import { OverlayContainerContext } from "./overlay-container";
import { PullToRefreshContent, PullToRefreshIndicator, PullToRefreshRoot } from "./pull-to-refresh";

export interface AppScreenProps extends Omit<SeedAppScreen.RootProps, "asChild"> {
  preventSwipeBack?: boolean;
}

export const AppScreen = forwardRef<HTMLDivElement, AppScreenProps>(
  ({ children, onSwipeBackEnd, preventSwipeBack, ...otherProps }, ref) => {
    const { pop } = useFlow();
    const { isRoot } = useActivity();
    // 뒤로 스와이프는 이 SEED 스와이프 하나뿐이다. 모바일 스택은 브라우저 history 를 쌓지
    // 않아 OS(iOS) 스와이프 제스처가 동작하지 않는다 (app/m/_stack/next-aware-history.ts).
    const shouldSwipeBack = !isRoot && !preventSwipeBack;

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
