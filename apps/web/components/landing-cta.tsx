"use client";

import { IconArrowRightLine } from "@karrotmarket/react-monochrome-icon";
import { SuffixIcon } from "@seed-design/react";
import { AppleSignInActionButton } from "@web/components/apple-sign-in-action-button";
import { authClient, useSession } from "@web/lib/auth-client";
import { ActionButton, type ActionButtonProps } from "@web/seed-design/ui/action-button";

/** 놓이는 자리별 로그인 버튼 모양. 로그인 뒤의 "내 자산 보기" 는 어디서나 brand 로 강조한다. */
const PLACEMENT_PROPS = {
  header: { variant: "neutralWeak", size: "small" },
  hero: { variant: "neutralSolid", size: "large" },
} as const satisfies Record<string, ActionButtonProps>;

/** 헤더는 좁아서 카카오만, 본문(`hero`)에는 Apple 로그인 버튼을 함께 둔다. */
export function LandingCta({ placement }: { placement: keyof typeof PLACEMENT_PROPS }) {
  const { data: session, isPending } = useSession();
  const buttonProps = PLACEMENT_PROPS[placement];

  if (isPending) {
    return (
      <ActionButton {...buttonProps} disabled>
        잠시만요…
      </ActionButton>
    );
  }

  if (session?.user) {
    return (
      <ActionButton {...buttonProps} variant="brandSolid" asChild>
        <a href="/assets">
          내 자산 보기
          <SuffixIcon svg={<IconArrowRightLine />} />
        </a>
      </ActionButton>
    );
  }

  return (
    <div className="flex flex-col gap-x2 sm:flex-row">
      <ActionButton
        {...buttonProps}
        onClick={() =>
          authClient.signIn.social({
            provider: "kakao",
            callbackURL: "/assets",
          })
        }
      >
        카카오로 시작하기
        <SuffixIcon svg={<IconArrowRightLine />} />
      </ActionButton>
      {placement === "hero" && <AppleSignInActionButton size="large" callbackURL="/assets" />}
    </div>
  );
}
