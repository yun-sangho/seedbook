"use client";

import { type ReactNode, useEffect, useSyncExternalStore } from "react";
import {
  activateAccount,
  getActiveAccount,
  subscribeActiveAccount,
} from "@web/lib/account-storage";
import { useSession } from "@web/lib/auth-client";
import { useAllStoresHydrated } from "@web/lib/zustand-hydration";
import { Loader2 } from "lucide-react";

/**
 * 로그인한 계정의 저장 자리를 열고(`account-storage.ts`), 모든 persist store 가 하이드레이션을
 * 마친 뒤에만 자식을 렌더한다. 계정을 알기 전에는 store 가 하이드레이션하지 않는다.
 *
 * 왜 필요한가:
 *   - 기존 manager 컴포넌트들이 `state.length === 0` 로 빈 상태를 분기하는데,
 *     비동기 하이드레이션(클라우드 저장 등) 에서는 이 분기가 "진짜 데이터 0건"
 *     과 구분되지 않아 "첫 계좌 추가하기" 빈 상태가 잠깐 노출된다.
 *   - `AutoProgressTracker` 가 마운트 시점에 `getState()` 로 초기 합계를 시드
 *     하는데, 하이드레이션 전이면 0 으로 시드된 뒤 subscribe 가 실제 값을
 *     내보내며 가짜 progress point 를 만들어낸다.
 *
 * 루트 레이아웃에서 한 번 감싸면 두 문제 모두 해결된다.
 */
export function HydrationGate({ children }: { children: ReactNode }) {
  const hydrated = useAllStoresHydrated();
  const { data: session, isPending } = useSession();
  const userId: string | null = session?.user?.id ?? null;
  const account = useSyncExternalStore(subscribeActiveAccount, getActiveAccount, () => undefined);

  useEffect(() => {
    if (!isPending) void activateAccount(userId);
  }, [isPending, userId]);

  // 세션의 계정과 store 에 든 데이터의 계정이 다르면 (다른 탭에서 계정 전환 등) 새로고침될 때까지 가린다.
  const isOtherAccount = userId !== null && account !== userId;

  if (!hydrated || isOtherAccount) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="w-screen h-screen flex items-center justify-center"
      >
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="sr-only">데이터를 불러오는 중...</span>
      </div>
    );
  }

  return <>{children}</>;
}
