"use client";

import { PrefixIcon } from "@seed-design/react";
import { AppleLogo, useAppleSignInEnabled } from "@web/components/apple-sign-in-button";
import { authClient } from "@web/lib/auth-client";
import { ActionButton, type ActionButtonProps } from "@web/seed-design/ui/action-button";

/** 소개 페이지용 SEED 모양. 색은 검정(다크에서는 흰색) 바탕인 `neutralSolid`. */
export function AppleSignInActionButton({
  callbackURL,
  size,
}: {
  callbackURL: string;
  size?: ActionButtonProps["size"];
}) {
  const enabled = useAppleSignInEnabled();
  if (!enabled) return null;

  return (
    <ActionButton
      variant="neutralSolid"
      size={size}
      onClick={() => authClient.signIn.social({ provider: "apple", callbackURL })}
    >
      <PrefixIcon svg={<AppleLogo />} />
      Apple로 로그인
    </ActionButton>
  );
}
