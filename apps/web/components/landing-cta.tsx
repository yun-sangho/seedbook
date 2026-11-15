"use client";

import { AppleSignInButton } from "@web/components/apple-sign-in-button";
import { Button } from "@web/components/ui/button";
import { authClient, useSession } from "@web/lib/auth-client";
import { ArrowRight } from "lucide-react";

/** `withApple`: 본문 CTA 에서만 Apple 로그인 버튼을 함께 둔다 (헤더는 좁아서 카카오만). */
export function LandingCta({
  size = "lg",
  withApple = false,
}: {
  size?: "default" | "lg";
  withApple?: boolean;
}) {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <Button size={size} disabled>
        잠시만요…
      </Button>
    );
  }

  if (session?.user) {
    return (
      <Button size={size} asChild>
        <a href="/assets">
          내 자산 보기
          <ArrowRight className="ml-1 w-4 h-4" />
        </a>
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <Button
        size={size}
        onClick={() =>
          authClient.signIn.social({
            provider: "kakao",
            callbackURL: "/assets",
          })
        }
      >
        카카오로 시작하기
        <ArrowRight className="ml-1 w-4 h-4" />
      </Button>
      {withApple && <AppleSignInButton size={size} callbackURL="/assets" />}
    </div>
  );
}
