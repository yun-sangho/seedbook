"use client";

import { type ReactNode, useEffect, useState } from "react";
import { ProfileSetupGate } from "@mobile/components/profile-setup-gate";
import { StorageChoiceGate } from "@mobile/components/storage-choice-gate";
import { useSession } from "@mobile/lib/auth-client";
import {
  needsProfileSetup,
  type ProfileUser,
  setupNicknameDefault,
} from "@mobile/lib/seed-identity/profile";
import { randomNickname } from "@mobile/lib/seed-identity/seed-nickname";
import { fetchPendingStorageChoice, type PendingStorageChoice } from "@mobile/lib/storage-choice";
import { Loader2 } from "lucide-react";
import { clearOnboardingProgress, OnboardingFlow } from "./onboarding-flow";

type GateState =
  | { kind: "loading" }
  | { kind: "onboarding" }
  | { kind: "existing"; pending: PendingStorageChoice | null }
  | { kind: "open" };

/**
 * 약관 동의 뒤의 가입 단계. 새 가입자(저장 방식을 고르지 않았고 쓰던 데이터도 없는 계정)는 첫
 * 포트폴리오까지 심는 흐름(`OnboardingFlow`)을 거친다. 기존 사용자에게는 이 흐름을 띄우지 않고
 * 전처럼 필요한 것(씨앗 아바타·닉네임, 저장 방식)만 한 번 묻는다. 저장 방식을 확인하지 못하면
 * 앱을 연다 — 다음에 열 때 다시 묻는다.
 */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const user = session?.user as ProfileUser | undefined;
  const [state, setState] = useState<GateState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void fetchPendingStorageChoice().then((pending) => {
      if (cancelled) return;
      if (pending !== null && pending.current === null) {
        setState({ kind: "onboarding" });
        return;
      }
      clearOnboardingProgress();
      setState({ kind: "existing", pending });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 닉네임 기본값은 흐름을 여는 순간 한 번만 뽑는다.
  const [defaultNickname] = useState(() => setupNicknameDefault(user?.name, randomNickname));

  if (state.kind === "open") return <>{children}</>;
  if (state.kind === "onboarding") {
    return (
      <OnboardingFlow
        needsProfile={!user || needsProfileSetup(user)}
        defaultNickname={defaultNickname}
        onDone={() => setState({ kind: "open" })}
      />
    );
  }
  if (state.kind === "existing") {
    return (
      <ProfileSetupGate>
        <StorageChoiceGate pending={state.pending}>{children}</StorageChoiceGate>
      </ProfileSetupGate>
    );
  }
  return (
    <div
      role="status"
      aria-live="polite"
      className="w-screen h-screen flex items-center justify-center"
    >
      <Loader2 className="w-6 h-6 animate-spin text-fg-neutral-subtle" />
      <span className="sr-only">가입 단계를 확인하는 중...</span>
    </div>
  );
}
