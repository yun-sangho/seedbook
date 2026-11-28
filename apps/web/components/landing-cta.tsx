"use client";

import { IconArrowRightLine } from "@karrotmarket/react-monochrome-icon";
import { AppleSignInActionButton } from "@mobile/components/apple-sign-in-action-button";
import { useSocialSignIn } from "@mobile/hooks/use-social-sign-in";
import { useSession } from "@mobile/lib/auth-client";
import { DEFAULT_RETURN_PATH, LOGIN_FAILED_MESSAGE } from "@mobile/lib/login-flow";
import { ActionButton, type ActionButtonProps } from "@mobile/seed-design/ui/action-button";
import { SuffixIcon } from "@seed-design/react";

/** 놓이는 자리별 로그인 버튼 모양. 로그인 뒤의 "내 자산 보기" 는 어디서나 brand 로 강조한다. */
const PLACEMENT_PROPS = {
  header: { variant: "neutralWeak", size: "small" },
  hero: { variant: "neutralSolid", size: "large" },
} as const satisfies Record<string, ActionButtonProps>;

/**
 * 헤더는 좁아서 카카오만, 본문(`hero`)에는 Apple 로그인 버튼을 함께 둔다. 취소·실패하면 앱의 로그인
 * 화면(`/assets`)이 안내한다. 시작하지 못했을 때의 안내는 본문에만 두고 헤더는 버튼 이름으로 알린다.
 */
export function LandingCta({ placement }: { placement: keyof typeof PLACEMENT_PROPS }) {
  const { data: session, isPending } = useSession();
  const { pendingProvider, failed, signIn } = useSocialSignIn(DEFAULT_RETURN_PATH);
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
        <a href={DEFAULT_RETURN_PATH}>
          내 자산 보기
          <SuffixIcon svg={<IconArrowRightLine />} />
        </a>
      </ActionButton>
    );
  }

  const isHero = placement === "hero";
  return (
    <div className="flex flex-col gap-x2">
      <div className="flex flex-col gap-x2 sm:flex-row">
        <ActionButton
          {...buttonProps}
          loading={pendingProvider === "kakao"}
          disabled={pendingProvider === "apple"}
          onClick={() => signIn("kakao")}
        >
          {failed && !isHero ? "다시 시도" : "카카오로 시작하기"}
          <SuffixIcon svg={<IconArrowRightLine />} />
        </ActionButton>
        {isHero && (
          <AppleSignInActionButton
            size="large"
            loading={pendingProvider === "apple"}
            disabled={pendingProvider === "kakao"}
            onClick={() => signIn("apple")}
          />
        )}
      </div>
      {failed && isHero && (
        <p role="alert" className="t4-regular text-fg-neutral-muted break-keep">
          {LOGIN_FAILED_MESSAGE}
        </p>
      )}
    </div>
  );
}
