"use client";

import { type ReactNode, useEffect, useState } from "react";
import { AccountValueHistoryRunner } from "@web/components/account-value-history-runner";
import { sessionStorageOrNull } from "@web/components/biometric-sign-in-button";
import { ConsentGate } from "@web/components/consent-gate";
import { EntitySyncRunner } from "@web/components/entity-sync-runner";
import { LoginScreen } from "@web/components/login-screen";
import { AppLockOverlay } from "@web/components/mobile/app-lock";
import { PortfolioPlantGrowthRunner } from "@web/components/portfolio-plant-growth-runner";
import { PreferencesSync } from "@web/components/preferences-sync";
import { StorageModeSync } from "@web/components/storage-mode-sync";
import { OnboardingGate } from "@web/features/onboarding/components/onboarding-gate";
import { useSession } from "@web/lib/auth-client";
import { getDeviceStorage } from "@web/lib/device-storage";
import {
  addressWithoutSignedInWith,
  signedInWithFrom,
  writeLastLoginMethod,
} from "@web/lib/last-login-method";
import { clearSignedOutMark } from "@web/lib/native/biometric-login";
import { Loader2 } from "lucide-react";

/**
 * 세션이 없으면 앱 콘텐츠 대신 로그인 화면을 강제 노출한다.
 *
 * 이 게이트는 저장 모드(local / cloud)와 무관하다. 로그인하지 않은 사용자는
 * 어떤 경로에서도 앱을 사용할 수 없다.
 *
 * 로그인 뒤 순서: 약관 동의 → 가입 단계(`OnboardingGate` — 새 가입자는 닉네임 → 첫 포트폴리오 심기 →
 * 저장 방식, 기존 사용자는 필요한 것만 한 번) → 앱. 가입 단계가 끝나기 전에는 동기화를 시작하지
 * 않는다. 앱 잠금은 가입 단계 화면까지 가린다.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();
  const signedIn = Boolean(session?.user);

  // 다시 로그인했으면 "방금 로그아웃함" 표시를 지워, 다음에 로그인 화면이 뜰 때 생체 인증
  // 프롬프트를 자동으로 띄운다 (`BiometricSignInButton`).
  useEffect(() => {
    const storage = signedIn ? sessionStorageOrNull() : null;
    if (storage) clearSignedOutMark(storage);
  }, [signedIn]);

  // 소셜 로그인에 성공해 돌아오면 주소에 수단이 붙어 있다 (`hooks/use-social-sign-in.ts`). 이 기기의
  // 최근 로그인 수단으로 남기고, 새로고침·공유에 남지 않게 주소에서 지운다.
  useEffect(() => {
    if (!signedIn) return;
    const provider = signedInWithFrom(window.location);
    if (!provider) return;
    writeLastLoginMethod(getDeviceStorage(), provider);
    window.history.replaceState(
      window.history.state,
      "",
      addressWithoutSignedInWith(window.location)
    );
  }, [signedIn]);

  // 세션이 없으면 다시 조회할 때마다(창 포커스 등) isPending 이 켜진다. 한 번 확인한 뒤에는 로그인
  // 화면을 유지해 오류 안내가 사라지거나 생체 인증 프롬프트가 다시 뜨지 않게 한다.
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    if (!isPending) setChecked(true);
  }, [isPending]);

  if (isPending && !checked) {
    // HydrationGate 의 로딩 화면과 같은 모양이라 이어져 보인다.
    return (
      <div
        role="status"
        aria-live="polite"
        className="w-screen h-screen flex items-center justify-center"
      >
        <Loader2 className="w-6 h-6 animate-spin text-fg-neutral-subtle" />
        <span className="sr-only">로그인 상태를 확인하는 중...</span>
      </div>
    );
  }

  if (session?.user) {
    return (
      <ConsentGate key={session.user.id}>
        <OnboardingGate>
          <StorageModeSync />
          <PreferencesSync />
          <EntitySyncRunner />
          <AccountValueHistoryRunner />
          <PortfolioPlantGrowthRunner />
          {children}
        </OnboardingGate>
        {/* 네이티브 앱에서 앱 잠금을 켰을 때만 그려진다. */}
        <AppLockOverlay />
      </ConsentGate>
    );
  }

  return <LoginScreen />;
}
