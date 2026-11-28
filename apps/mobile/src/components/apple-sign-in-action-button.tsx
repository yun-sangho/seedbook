"use client";

import type { ReactNode } from "react";
import { AppleLogo, useAppleSignInEnabled } from "@mobile/components/apple-sign-in-button";
import { canSignInWith } from "@mobile/lib/native/social-login";
import { ActionButton, type ActionButtonProps } from "@mobile/seed-design/ui/action-button";
import { PrefixIcon } from "@seed-design/react";

/**
 * Sign in with Apple 버튼 (App Store 지침 4.8). 로고 + "Apple로 로그인", 색은 검정(다크에서는 흰색)
 * 바탕인 `neutralSolid`. 서버에 Apple 설정이 없거나 이 기기에서 쓸 수 없으면 (번들 앱의 Android,
 * `canSignInWith`) 아무것도 그리지 않는다 (`hint` 도 함께 숨는다).
 */
export function AppleSignInActionButton({
  hint,
  ...props
}: Pick<ActionButtonProps, "size" | "loading" | "disabled" | "onClick"> & {
  /** 버튼 바로 아래에 붙는 안내 (로그인 화면의 "최근에 Apple로 로그인했어요"). */
  hint?: ReactNode;
}) {
  const enabled = useAppleSignInEnabled();
  if (!enabled || !canSignInWith("apple")) return null;

  return (
    <>
      <ActionButton variant="neutralSolid" {...props}>
        <PrefixIcon svg={<AppleLogo />} />
        Apple로 로그인
      </ActionButton>
      {hint}
    </>
  );
}
