"use client";

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { StorageModeSync } from "@web/components/storage-mode-sync";
import { Button } from "@web/components/ui/button";
import { authClient, useSession } from "@web/lib/auth-client";
import { LogIn } from "lucide-react";

// Next.js 가 빌드 타임에 치환하므로 클라이언트 번들에서도 사용 가능.
const isDevEnv = process.env.NODE_ENV === "development";

/**
 * 로그인 후 돌아갈 경로. 초대 링크(/invite/...)는 그 자리에서 다시 수락 흐름을
 * 이어가야 하므로 현재 경로를 그대로 callbackURL 로 쓴다. 그 외는 기본 /assets.
 */
function resolveCallbackURL(pathname: string | null): string {
  if (pathname && pathname.startsWith("/invite/")) return pathname;
  return "/assets";
}

async function signInWithDevBypass(callbackURL: string) {
  const response = await fetch("/api/auth/dev-login", { method: "POST" });
  if (!response.ok) {
    throw new Error(`dev-login failed: ${response.status}`);
  }
  window.location.href = callbackURL;
}

/**
 * 세션이 없으면 앱 콘텐츠 대신 로그인 화면을 강제 노출한다.
 *
 * 이 게이트는 저장 모드(local / cloud)와 무관하다. 로그인하지 않은 사용자는
 * 어떤 경로에서도 앱을 사용할 수 없다. 로그인 이후 저장 백엔드 선택(브라우저
 * 전용 / 클라우드 동기화)은 `/admin` 에서 그대로 할 수 있다.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();
  const pathname = usePathname();
  const callbackURL = resolveCallbackURL(pathname);

  if (isPending) {
    // better-auth 세션 조회 중에는 공백만 띄운다 (HydrationGate 가 이미 로딩 UI
    // 를 렌더링하고 난 뒤이므로 이중 스피너는 피한다).
    return null;
  }

  if (session?.user) {
    return (
      <>
        <StorageModeSync />
        {children}
      </>
    );
  }

  return (
    <div className="w-screen h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full flex flex-col items-center text-center gap-4">
        <LogIn className="w-10 h-10 text-muted-foreground" />
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">로그인이 필요합니다</h2>
          <p className="text-sm text-muted-foreground">
            서비스를 이용하려면 카카오 계정으로 로그인해 주세요.
          </p>
        </div>
        <div className="flex flex-col gap-2 w-full">
          <Button
            onClick={() =>
              authClient.signIn.social({
                provider: "kakao",
                callbackURL,
              })
            }
          >
            카카오로 로그인
          </Button>
          {isDevEnv && (
            <Button variant="outline" onClick={() => signInWithDevBypass(callbackURL)}>
              개발용 빠른 로그인 (카카오 우회)
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
