"use client";

import { type ReactNode, useState } from "react";
import { ProfileFields, useProfileDraft } from "@web/components/profile-editor";
import { useSession } from "@web/lib/auth-client";
import {
  needsProfileSetup,
  type ProfileUser,
  setupNicknameDefault,
} from "@web/lib/seed-identity/profile";
import { randomSeedAvatar } from "@web/lib/seed-identity/seed-avatar";
import { randomNickname } from "@web/lib/seed-identity/seed-nickname";
import { ActionButton } from "@web/seed-design/ui/action-button";

/**
 * 씨앗 아바타가 없는 기존 사용자에게 앱 대신 "아바타·닉네임 정하기" 를 한 번 보여 준다 (다음 실행
 * 때). 새 가입자는 `OnboardingGate` 의 첫 가입 흐름에서 닉네임을 정한다. 실명·사진은 받지 않는다
 * (`lib/auth-privacy.ts`).
 */
export function ProfileSetupGate({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const user = session?.user as ProfileUser | undefined;
  const [done, setDone] = useState(false);

  if (done || !user || !needsProfileSetup(user)) return <>{children}</>;
  return <ProfileSetupScreen name={user.name} onDone={() => setDone(true)} />;
}

function ProfileSetupScreen({
  name,
  onDone,
}: {
  name: string | null | undefined;
  onDone: () => void;
}) {
  const [initial] = useState(() => ({
    avatar: randomSeedAvatar(),
    nickname: setupNicknameDefault(name, randomNickname),
  }));
  const draft = useProfileDraft(initial);

  const start = async () => {
    if (await draft.save()) onDone();
  };

  return (
    <main className="bg-bg-layer-default text-fg-neutral flex h-dvh w-full flex-col overflow-y-auto px-x6 pt-[env(safe-area-inset-top)] pb-[calc(env(safe-area-inset-bottom)+24px)]">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-x8 pt-x16">
        <div className="flex flex-col gap-x2">
          <h1 className="t8-bold break-keep">나를 나타낼 씨앗을 골라 주세요</h1>
          <p className="t5-regular text-fg-neutral-muted break-keep">
            Seedbook 에서는 이름과 사진 대신 씨앗 아바타와 닉네임을 써요. 언제든 프로필에서 바꿀 수
            있어요.
          </p>
        </div>
        <ProfileFields draft={draft} rerollNickname avatarSize={120} />
        <div className="mt-auto flex flex-col">
          <ActionButton
            variant="neutralSolid"
            size="large"
            loading={draft.saving}
            disabled={draft.saving}
            onClick={start}
          >
            시작하기
          </ActionButton>
        </div>
      </div>
    </main>
  );
}
