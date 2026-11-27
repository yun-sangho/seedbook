"use client";

import { useState } from "react";
import { IconArrowClockwiseCircularLine } from "@karrotmarket/react-monochrome-icon";
import { PrefixIcon } from "@seed-design/react";
import { SeedAvatar } from "@web/components/seed-avatar";
import { authClient } from "@web/lib/auth-client";
import {
  NICKNAME_ERROR_MESSAGES,
  NICKNAME_MAX_LENGTH,
  nicknameError,
  normalizeNickname,
} from "@web/lib/seed-identity/profile";
import {
  parseSeedAvatarKey,
  randomSeedAvatar,
  type SeedAvatarVariant,
  seedAvatarKey,
} from "@web/lib/seed-identity/seed-avatar";
import { randomNickname } from "@web/lib/seed-identity/seed-nickname";
import { ActionButton } from "@web/seed-design/ui/action-button";
import { TextField, TextFieldInput } from "@web/seed-design/ui/text-field";
import { UserRound } from "lucide-react";

/** 사용자 아바타. 씨앗 아바타 키가 아니면(가입 단계 전) 기본 아이콘. */
export function UserAvatar({ image, size }: { image: string | null | undefined; size: number }) {
  const variant = parseSeedAvatarKey(image);
  if (variant) return <SeedAvatar variant={variant} size={size} className="shrink-0" />;
  return (
    <span
      className="bg-bg-neutral-weak text-fg-neutral-muted flex shrink-0 items-center justify-center overflow-hidden rounded-full"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <UserRound size={Math.round(size * 0.6)} strokeWidth={1.75} />
    </span>
  );
}

/** 다시 뽑으면 지금과 다른 아바타가 나오게 한다. */
function differentSeedAvatar(current: SeedAvatarVariant): SeedAvatarVariant {
  const currentKey = seedAvatarKey(current);
  let next = randomSeedAvatar();
  while (seedAvatarKey(next) === currentKey) next = randomSeedAvatar();
  return next;
}

/** 아바타·닉네임 편집 상태. 저장은 `updateUser` — 서버도 같은 규칙으로 검사한다. */
export function useProfileDraft(initial: { avatar: SeedAvatarVariant; nickname: string }) {
  const [avatar, setAvatar] = useState(initial.avatar);
  const [nickname, setNickname] = useState(initial.nickname);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reroll = (options: { nickname: boolean }) => {
    setAvatar(differentSeedAvatar(avatar));
    if (options.nickname) {
      setNickname(randomNickname());
      setError(null);
    }
  };

  const changeNickname = (value: string) => {
    setNickname(value);
    setError(null);
  };

  /** 저장에 성공하면 true. */
  const save = async (): Promise<boolean> => {
    const invalid = nicknameError(nickname);
    if (invalid) {
      setError(NICKNAME_ERROR_MESSAGES[invalid]);
      return false;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await authClient.updateUser({
        name: normalizeNickname(nickname),
        image: seedAvatarKey(avatar),
      });
      if (result?.error) throw new Error(result.error.message ?? "update failed");
      return true;
    } catch {
      setError("저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  return { avatar, nickname, error, saving, reroll, changeNickname, save };
}

export type ProfileDraft = ReturnType<typeof useProfileDraft>;

/** 큰 아바타 + 다시 뽑기 + 닉네임 입력. */
export function ProfileFields({
  draft,
  rerollNickname,
  avatarSize,
}: {
  draft: ProfileDraft;
  /** 다시 뽑기가 닉네임도 새로 뽑는지 (가입 단계). */
  rerollNickname: boolean;
  avatarSize: number;
}) {
  return (
    <div className="flex flex-col items-center gap-x5">
      <SeedAvatar variant={draft.avatar} size={avatarSize} />
      <ActionButton
        variant="neutralWeak"
        size="small"
        onClick={() => draft.reroll({ nickname: rerollNickname })}
      >
        <PrefixIcon svg={<IconArrowClockwiseCircularLine />} />
        다시 뽑기
      </ActionButton>
      <div className="w-full">
        <TextField
          label="닉네임"
          description={`실명이 아니어도 괜찮아요 · ${NICKNAME_MAX_LENGTH}자까지`}
          value={draft.nickname}
          onValueChange={({ value }) => draft.changeNickname(value)}
          invalid={!!draft.error}
          errorMessage={draft.error ?? undefined}
        >
          <TextFieldInput placeholder="닉네임" maxLength={NICKNAME_MAX_LENGTH} />
        </TextField>
      </div>
    </div>
  );
}
