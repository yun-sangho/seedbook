"use client";

import { PrefixIcon } from "@seed-design/react";
import { AppleLogo, useAppleSignInEnabled } from "@web/components/apple-sign-in-button";
import { ActionButton, type ActionButtonProps } from "@web/seed-design/ui/action-button";

/**
 * Sign in with Apple 버튼 (App Store 지침 4.8). 로고 + "Apple로 로그인", 색은 검정(다크에서는 흰색)
 * 바탕인 `neutralSolid`. 서버에 Apple 설정이 없으면 아무것도 그리지 않는다.
 */
export function AppleSignInActionButton(
  props: Pick<ActionButtonProps, "size" | "loading" | "disabled" | "onClick">
) {
  const enabled = useAppleSignInEnabled();
  if (!enabled) return null;

  return (
    <ActionButton variant="neutralSolid" {...props}>
      <PrefixIcon svg={<AppleLogo />} />
      Apple로 로그인
    </ActionButton>
  );
}
