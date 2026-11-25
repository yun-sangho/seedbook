"use client";

import { useState } from "react";
import { reloadApp } from "@web/lib/device-storage";
import { applyStorageChoice } from "@web/lib/storage-choice";
import type { StorageMode } from "@web/lib/storage-mode";
import { ActionButton } from "@web/seed-design/ui/action-button";
import { Badge } from "@web/seed-design/ui/badge";
import { Callout } from "@web/seed-design/ui/callout";
import {
  RadioSelectBoxItem,
  RadioSelectBoxRadiomark,
  RadioSelectBoxRoot,
} from "@web/seed-design/ui/select-box";

const OPTIONS: ReadonlyArray<{ mode: StorageMode; title: string; description: string }> = [
  {
    mode: "local",
    title: "이 기기에만 저장",
    description:
      "자산 정보를 서버로 보내지 않아요. 앱이나 브라우저 데이터를 지우거나 기기를 바꾸면 되살릴 수 없어요.",
  },
  {
    mode: "cloud",
    title: "클라우드에 저장",
    description:
      "자산 정보를 서버에 저장해요. 같은 계정으로 로그인하면 어느 기기에서든 같은 데이터를 봐요.",
  },
];

const SWITCH_NOTICE: Record<StorageMode, string> = {
  cloud:
    "이 기기의 데이터를 클라우드에 올려 합쳐요. 지워지는 항목은 없고, 같은 항목은 이 기기의 내용으로 맞춰요.",
  local:
    "클라우드 데이터를 이 기기로 받아 합쳐요. 지워지는 항목은 없고, 같은 항목은 이 기기의 내용을 유지해요. 다른 기기도 각자 저장해요.",
};

interface StorageChoiceScreenProps {
  /** 지금 쓰는 방식. 새 사용자는 null — 아무것도 미리 고르지 않는다. */
  current: StorageMode | null;
  /** 저장 방식이 그대로라 바로 앱을 열면 된다. */
  onDone: () => void;
}

/** 저장 방식 선택 화면. 계정마다 한 번, 약관 동의 다음에 보여 준다. */
export function StorageChoiceScreen({ current, onDone }: StorageChoiceScreenProps) {
  const [selected, setSelected] = useState<StorageMode | null>(current);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const submit = async () => {
    if (selected === null) return;
    setPending(true);
    setFailed(false);
    const result = await applyStorageChoice(current, selected);
    if (result === "open") onDone();
    else if (result === "reload") await reloadApp();
    else {
      setPending(false);
      setFailed(true);
    }
  };

  const switching = current !== null && selected !== null && selected !== current;

  return (
    <main className="bg-bg-layer-default text-fg-neutral flex h-dvh w-full flex-col overflow-y-auto px-x6 pt-[env(safe-area-inset-top)] pb-[calc(env(safe-area-inset-bottom)+24px)]">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-x8 pt-x16">
        <div className="flex flex-col gap-x2">
          <h1 className="t8-bold break-keep">
            {current === null ? "어디에 저장할까요?" : "저장 방식을 확인해 주세요"}
          </h1>
          <p className="t5-regular text-fg-neutral-muted break-keep">
            {current === null
              ? "계좌와 포트폴리오를 저장할 곳을 골라 주세요. 나중에 설정에서 바꿀 수 있어요."
              : "지금 방식을 그대로 쓰거나 바꿀 수 있어요. 나중에 설정에서도 바꿀 수 있어요."}
          </p>
        </div>

        <RadioSelectBoxRoot
          aria-label="저장 방식"
          value={selected ?? ""}
          disabled={pending}
          onValueChange={(value) => setSelected(value as StorageMode)}
        >
          {OPTIONS.map(({ mode, title, description }) => (
            <RadioSelectBoxItem
              key={mode}
              value={mode}
              label={
                <span className="flex items-center gap-x2">
                  {title}
                  {mode === current && (
                    <Badge tone="neutral" variant="weak">
                      지금 방식
                    </Badge>
                  )}
                </span>
              }
              description={description}
              suffix={<RadioSelectBoxRadiomark />}
            />
          ))}
        </RadioSelectBoxRoot>

        {switching && <Callout tone="neutral" description={SWITCH_NOTICE[selected]} />}

        <div className="mt-auto flex flex-col gap-x2">
          {failed && (
            <div role="alert" className="pb-x2">
              <Callout
                tone="neutral"
                description="처리하지 못했어요. 잠시 뒤 다시 시도해 주세요."
              />
            </div>
          )}
          <ActionButton
            variant="neutralSolid"
            size="large"
            disabled={selected === null}
            loading={pending}
            onClick={submit}
          >
            이대로 시작하기
          </ActionButton>
        </div>
      </div>
    </main>
  );
}
