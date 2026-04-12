"use client";

import { Button } from "@web/components/ui/button";
import { authClient, useSession } from "@web/lib/auth-client";
import { getStorageMode, setStorageMode } from "@web/lib/storage-mode";
import { CloudOff } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

/**
 * 클라우드 저장 모드에서 세션이 없으면 로그인 화면을 강제 노출한다.
 *
 * 사용자가 선택한 동작 ("클라우드 모드에서 로그인 세션이 만료되면 강제 로그인
 * 화면"). 로그인이 필요하므로 폴백 데이터는 보여주지 않고, 로그인 버튼과
 * "임시로 브라우저 저장으로 돌아가기" 탈출구만 제공한다.
 *
 * 로컬 모드에선 투명하게 children 을 렌더한다.
 */
export function CloudAuthGate({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();
  const [mode, setMode] = useState<"local" | "cloud">("local");

  // 클라이언트에서만 저장소 모드를 확인 (SSR 에선 기본값인 "local" 유지).
  useEffect(() => {
    setMode(getStorageMode());
  }, []);

  if (mode !== "cloud") {
    return <>{children}</>;
  }

  if (isPending) {
    // better-auth 세션 조회 중에는 공백만 띄운다 (HydrationGate 가 이미 로딩 UI
    // 를 렌더링하고 난 뒤이므로 이중 스피너는 피한다).
    return null;
  }

  if (session?.user) {
    return <>{children}</>;
  }

  return (
    <div className="w-screen h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full flex flex-col items-center text-center gap-4">
        <CloudOff className="w-10 h-10 text-muted-foreground" />
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">로그인이 필요합니다</h2>
          <p className="text-sm text-muted-foreground">
            클라우드 저장 모드에서는 카카오 계정으로 로그인해야 자산 데이터를
            불러올 수 있습니다.
          </p>
        </div>
        <div className="flex flex-col gap-2 w-full">
          <Button
            onClick={() =>
              authClient.signIn.social({
                provider: "kakao",
                callbackURL: "/dashboard",
              })
            }
          >
            카카오로 로그인
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setStorageMode("local");
              window.location.reload();
            }}
          >
            브라우저 저장으로 전환
          </Button>
        </div>
      </div>
    </div>
  );
}
