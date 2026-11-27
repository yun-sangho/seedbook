"use client";

import { useState } from "react";
import { ANONYMOUS_USER_NAME } from "@seedbook/database/anonymous-identity";
import { ProfileFields, UserAvatar, useProfileDraft } from "@web/components/profile-editor";
import { useSession } from "@web/lib/auth-client";
import type { ProfileUser } from "@web/lib/seed-identity/profile";
import { parseProfileImage } from "@web/lib/seed-identity/profile-image";
import { randomSeedAvatar } from "@web/lib/seed-identity/seed-avatar";
import { ActionButton } from "@web/seed-design/ui/action-button";
import {
  BottomSheetBody,
  BottomSheetContent,
  BottomSheetFooter,
  BottomSheetRoot,
} from "@web/seed-design/ui/bottom-sheet";

// 로그인에서 이름·이메일·사진을 받지 않는다 (`lib/auth-privacy.ts`). 씨앗 아바타와 닉네임은 가입
// 단계(`components/profile-setup-gate.tsx`)에서 정하고, 여기서 다시 바꾼다.
export function useSessionUser(): ProfileUser | undefined {
  const { data: session } = useSession();
  return session?.user as ProfileUser | undefined;
}

/** 지금 사용자의 아바타. */
export function SessionUserAvatar({ size }: { size: number }) {
  return <UserAvatar image={useSessionUser()?.image} size={size} />;
}

/**
 * 앱바 오른쪽의 계정 버튼. 하단 탭의 최상위 화면에서만 보인다 (상세 화면은 같은 자리에
 * "수정" 버튼). 시트는 앱바 밖에 따로 렌더한다 (`app/m/_stack/screens.tsx`).
 */
export function ProfileButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="내 프로필"
      onClick={onClick}
      className="flex size-x10 items-center justify-center"
    >
      <SessionUserAvatar size={28} />
    </button>
  );
}

/** 프로필(아바타·닉네임) 편집 시트. 열 때마다 현재 값으로 폼을 초기화한다. */
export function ProfileSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const user = useSessionUser();
  return (
    <ProfileSheetBody key={String(open)} open={open} onOpenChange={onOpenChange} user={user} />
  );
}

function ProfileSheetBody({
  open,
  onOpenChange,
  user,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: ProfileUser | undefined;
}) {
  const [initial] = useState(() => {
    const image = parseProfileImage(user?.image);
    return {
      avatar: image.seed ?? randomSeedAvatar(),
      plantPortfolioId: image.plantPortfolioId,
      nickname: user?.name ?? ANONYMOUS_USER_NAME,
    };
  });
  const draft = useProfileDraft(initial);
  const unchanged = draft.avatar === initial.avatar && draft.nickname === initial.nickname;

  const save = async () => {
    if (await draft.save()) onOpenChange(false);
  };

  return (
    <BottomSheetRoot open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent title="내 프로필" showHandle>
        <BottomSheetBody>
          <ProfileFields draft={draft} rerollNickname={false} avatarSize={88} />
        </BottomSheetBody>
        <BottomSheetFooter>
          <ActionButton
            size="large"
            className="w-full"
            loading={draft.saving}
            disabled={draft.saving || unchanged}
            onClick={save}
          >
            저장
          </ActionButton>
        </BottomSheetFooter>
      </BottomSheetContent>
    </BottomSheetRoot>
  );
}
