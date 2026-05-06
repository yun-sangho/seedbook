"use client";

import { Button } from "@web/components/ui/button";
import { authClient, useSession } from "@web/lib/auth-client";
import { ArrowRight } from "lucide-react";

export function LandingCta({ size = "lg" }: { size?: "default" | "lg" }) {
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
  );
}
