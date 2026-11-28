"use client";

import { useState } from "react";
import { BottomAction } from "@mobile/components/mobile/bottom-action";
import { useSessionUser } from "@mobile/components/mobile/profile-menu";
import { DELETE_ACCOUNT_COPY, useDeleteAccount } from "@mobile/hooks/use-delete-account";
import { ActionButton } from "@mobile/seed-design/ui/action-button";
import { Callout } from "@mobile/seed-design/ui/callout";
import { Checkbox } from "@mobile/seed-design/ui/checkbox";
import { ANONYMOUS_USER_NAME } from "@seedbook/domain/anonymous-identity";

/** 탈퇴하면 일어나는 일. 확인 체크가 확인 단계라 확인창은 따로 띄우지 않는다. */
export const DELETE_ACCOUNT_NOTICES = [
  "계좌·포트폴리오·리밸런싱 기록과 설정이 서버와 이 기기에서 모두 지워지고 되돌릴 수 없어요",
  "키운 식물과 프로필(아바타·닉네임)도 함께 지워져요",
  "같은 로그인 수단으로 다시 가입하면 새 계정으로 시작해요",
] as const;

/**
 * 설정 → 탈퇴하기. 안내 → "안내 내용을 확인했어요" 체크 → 하단 "탈퇴하기"(critical) 로 바로 탈퇴한다.
 * 로그인한 지 오래돼 서버가 거절하면 같은 화면이 재로그인 안내로 바뀐다 (`useDeleteAccount`).
 */
export function DeleteAccountMobile() {
  const user = useSessionUser();
  const { pending, outcome, confirmDelete, signOutToReauthenticate } = useDeleteAccount();
  const [agreed, setAgreed] = useState(false);
  const name = `${user?.name || ANONYMOUS_USER_NAME}님`;

  if (outcome === "reauth-required") {
    return (
      <div className="flex flex-col gap-x4 px-x4 pt-x4 pb-x8">
        <h1 className="t7-bold text-fg-neutral">{DELETE_ACCOUNT_COPY.reauthTitle}</h1>
        <p className="t4-regular text-fg-neutral-muted">{DELETE_ACCOUNT_COPY.reauthDescription}</p>
        <BottomAction>
          <ActionButton size="large" variant="neutralSolid" onClick={signOutToReauthenticate}>
            {DELETE_ACCOUNT_COPY.reauthLabel}
          </ActionButton>
        </BottomAction>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-x6 px-x4 pt-x4 pb-x8">
      <h1 className="t7-bold text-fg-neutral">{name}, 탈퇴하기 전에 확인해 주세요</h1>
      <ul className="marker:text-fg-neutral-subtle flex list-disc flex-col gap-x2 pl-x5">
        {DELETE_ACCOUNT_NOTICES.map((notice) => (
          <li key={notice} className="t4-regular text-fg-neutral">
            {notice}
          </li>
        ))}
      </ul>
      {outcome === "failed" && <Callout tone="critical" description={DELETE_ACCOUNT_COPY.failed} />}
      <Checkbox
        label="안내 내용을 확인했어요"
        checked={agreed}
        onCheckedChange={setAgreed}
        disabled={pending}
      />
      <BottomAction>
        <ActionButton
          size="large"
          variant="criticalSolid"
          disabled={!agreed}
          loading={pending}
          onClick={() => {
            if (agreed && !pending) void confirmDelete();
          }}
        >
          {DELETE_ACCOUNT_COPY.confirmLabel}
        </ActionButton>
      </BottomAction>
    </div>
  );
}
