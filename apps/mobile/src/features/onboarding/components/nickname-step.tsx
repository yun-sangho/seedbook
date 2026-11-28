"use client";

import { useState } from "react";
import { IconArrowClockwiseCircularLine } from "@karrotmarket/react-monochrome-icon";
import { PlantAvatar } from "@mobile/features/garden/components/plant-avatar";
import { authClient } from "@mobile/lib/auth-client";
import {
  NICKNAME_ERROR_MESSAGES,
  NICKNAME_MAX_LENGTH,
  nicknameError,
  normalizeNickname,
} from "@mobile/lib/seed-identity/profile";
import { profileImageKey } from "@mobile/lib/seed-identity/profile-image";
import { randomSeedAvatar, type SeedAvatarVariant } from "@mobile/lib/seed-identity/seed-avatar";
import { randomNickname } from "@mobile/lib/seed-identity/seed-nickname";
import { ActionButton } from "@mobile/seed-design/ui/action-button";
import { TextField, TextFieldInput } from "@mobile/seed-design/ui/text-field";
import { PrefixIcon } from "@seed-design/react";
import { OnboardingStepLayout } from "./onboarding-step-layout";

/**
 * 닉네임과 씨앗 아바타 키를 저장한다. 아바타는 고르지 않는다 — 첫 식물이 아바타가 되고
 * (`resolveProfileAvatar`), 씨앗 키는 포트폴리오가 없을 때 돌아갈 자리로 함께 둔다.
 */
async function saveProfile(nickname: string, avatar: SeedAvatarVariant): Promise<boolean> {
  try {
    const result = await authClient.updateUser({
      name: normalizeNickname(nickname),
      image: profileImageKey({ seed: avatar, plantPortfolioId: null }),
    });
    return !result?.error;
  } catch {
    return false;
  }
}

const SAVE_FAILED = "저장하지 못했어요. 잠시 후 다시 시도해 주세요.";

export function NicknameStep({
  defaultNickname,
  onDone,
}: {
  /** 미리 채울 닉네임 (무작위 또는 이미 정한 이름). "나중에 하기" 도 이 값을 저장한다. */
  defaultNickname: string;
  onDone: () => void;
}) {
  const [avatar] = useState(randomSeedAvatar);
  const [nickname, setNickname] = useState(defaultNickname);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<"next" | "later" | null>(null);

  const save = async (value: string, kind: "next" | "later") => {
    setSaving(kind);
    setError(null);
    const ok = await saveProfile(value, avatar);
    setSaving(null);
    if (ok) onDone();
    else setError(SAVE_FAILED);
  };

  const next = () => {
    const invalid = nicknameError(nickname);
    if (invalid) {
      setFieldError(NICKNAME_ERROR_MESSAGES[invalid]);
      return;
    }
    void save(nickname, "next");
  };

  return (
    <OnboardingStepLayout
      progress={1}
      title="어떻게 불러 드릴까요?"
      description="실명 대신 쓸 닉네임이에요. 언제든 프로필에서 바꿀 수 있어요."
      primary={{ label: "다음", onClick: next, loading: saving === "next" }}
      onLater={() => void save(defaultNickname, "later")}
      busy={saving !== null}
      error={error}
    >
      <div className="flex flex-col items-center gap-x5 pt-x4">
        <PlantAvatar stage="seed" size={96} />
        <div className="w-full">
          <TextField
            label="닉네임"
            description={`${NICKNAME_MAX_LENGTH}자까지`}
            value={nickname}
            onValueChange={({ value }) => {
              setNickname(value);
              setFieldError(null);
            }}
            invalid={!!fieldError}
            errorMessage={fieldError ?? undefined}
          >
            <TextFieldInput placeholder="닉네임" maxLength={NICKNAME_MAX_LENGTH} />
          </TextField>
        </div>
        <ActionButton
          variant="neutralWeak"
          size="small"
          onClick={() => {
            setNickname(randomNickname());
            setFieldError(null);
          }}
        >
          <PrefixIcon svg={<IconArrowClockwiseCircularLine />} />
          다른 닉네임 추천
        </ActionButton>
      </div>
    </OnboardingStepLayout>
  );
}
