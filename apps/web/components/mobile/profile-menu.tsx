"use client";

import { useState } from "react";
import { ANONYMOUS_USER_NAME } from "@seedbook/database/anonymous-identity";
import { PlantAvatarPicker } from "@web/components/mobile/plant-avatar-picker";
import { ProfileAvatarImage } from "@web/components/profile-avatar";
import { ProfileFields, useProfileDraft } from "@web/components/profile-editor";
import { resolveProfileAvatar } from "@web/features/portfolio/utils/plant-avatar";
import { usePortfolioPlantViews } from "@web/features/portfolio/utils/use-portfolio-plants";
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

/**
 * 지금 사용자의 아바타: 고른 식물(없으면 가장 크게 자란 식물)의 지금 단계, 포트폴리오가 없으면
 * 씨앗 아바타 (`resolveProfileAvatar`).
 */
export function SessionUserAvatar({ size }: { size: number }) {
  const image = useSessionUser()?.image;
  const { plants } = usePortfolioPlantViews();
  return <ProfileAvatarImage avatar={resolveProfileAvatar(image, plants)} size={size} />;
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
  const { plants } = usePortfolioPlantViews();
  const unchanged =
    draft.avatar === initial.avatar &&
    draft.plantPortfolioId === initial.plantPortfolioId &&
    draft.nickname === initial.nickname;

  const save = async () => {
    if (await draft.save()) onOpenChange(false);
  };

  return (
    <BottomSheetRoot open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent title="내 프로필" showHandle>
        <BottomSheetBody>
          <ProfileFields
            draft={draft}
            rerollNickname={false}
            avatarSize={88}
            avatarPicker={
              plants.length > 0 ? (
                <PlantAvatarPicker draft={draft} plants={plants} avatarSize={88} />
              ) : undefined
            }
          />
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
