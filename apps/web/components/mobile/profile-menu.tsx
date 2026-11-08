"use client";

import { useState } from "react";
import { authClient, useSession } from "@web/lib/auth-client";
import { ActionButton } from "@web/seed-design/ui/action-button";
import {
  BottomSheetBody,
  BottomSheetContent,
  BottomSheetFooter,
  BottomSheetRoot,
} from "@web/seed-design/ui/bottom-sheet";
import { TextField, TextFieldInput } from "@web/seed-design/ui/text-field";

interface SessionUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

function useSessionUser(): SessionUser | undefined {
  const { data: session } = useSession();
  return session?.user as SessionUser | undefined;
}

/** 프로필 사진, 없으면 이름 첫 글자. */
function Avatar({ user, size }: { user: SessionUser | undefined; size: number }) {
  const initial = (user?.name || user?.email || "?").trim().charAt(0).toUpperCase();
  return (
    <span
      className="bg-bg-neutral-weak text-fg-neutral-muted t4-bold flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-cover bg-center"
      // next/image 는 원격 도메인 설정이 필요해 배경 이미지로 그린다 (카카오 프로필 URL).
      style={{
        width: size,
        height: size,
        backgroundImage: user?.image ? `url("${user.image}")` : undefined,
      }}
      aria-hidden
    >
      {user?.image ? null : initial}
    </span>
  );
}

/**
 * 앱바 오른쪽의 계정 버튼. 하단 탭의 최상위 화면에서만 보인다 (상세 화면은 같은 자리에
 * "수정" 버튼). 시트는 앱바 밖에 따로 렌더한다 (`app/m/_stack/screens.tsx`).
 */
export function ProfileButton({ onClick }: { onClick: () => void }) {
  const user = useSessionUser();
  return (
    <button
      type="button"
      aria-label="내 프로필"
      onClick={onClick}
      className="flex size-x10 items-center justify-center"
    >
      <Avatar user={user} size={28} />
    </button>
  );
}

/** 프로필(이름) 편집 시트. 열 때마다 현재 이름으로 폼을 초기화한다. */
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
  user: SessionUser | undefined;
}) {
  const [name, setName] = useState(user?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim();

  const save = async () => {
    if (!trimmed) {
      setError("이름을 입력해주세요");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await authClient.updateUser({ name: trimmed });
      if (result?.error) throw new Error(result.error.message ?? "update failed");
      onOpenChange(false);
    } catch {
      setError("저장하지 못했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheetRoot open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent title="내 프로필" showHandle>
        <BottomSheetBody>
          <div className="flex flex-col gap-x5">
            <div className="flex items-center gap-x3">
              <Avatar user={user} size={56} />
              <div className="min-w-0">
                <p className="t5-bold truncate">{user?.name || "이름 없음"}</p>
                {user?.email && (
                  <p className="t3-regular text-fg-neutral-subtle truncate">{user.email}</p>
                )}
              </div>
            </div>
            <TextField
              label="이름"
              value={name}
              onValueChange={({ value }) => setName(value)}
              invalid={!!error}
              errorMessage={error ?? undefined}
            >
              <TextFieldInput placeholder="이름" maxLength={30} />
            </TextField>
          </div>
        </BottomSheetBody>
        <BottomSheetFooter>
          <ActionButton
            size="large"
            className="w-full"
            loading={saving}
            disabled={saving || trimmed === (user?.name ?? "")}
            onClick={save}
          >
            저장
          </ActionButton>
        </BottomSheetFooter>
      </BottomSheetContent>
    </BottomSheetRoot>
  );
}
