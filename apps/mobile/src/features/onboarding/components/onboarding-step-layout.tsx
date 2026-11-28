"use client";

import type { ReactNode } from "react";
import { IconChevronLeftLine } from "@karrotmarket/react-monochrome-icon";
import { ActionButton } from "@mobile/seed-design/ui/action-button";
import { Callout } from "@mobile/seed-design/ui/callout";
import {
  ONBOARDING_PROGRESS_STEPS,
  type OnboardingStep,
  onboardingProgressIndex,
} from "../utils/onboarding-flow";

/** 가입 진행 표시 (위쪽 칸). 저장 방식 화면(공용 컴포넌트)도 이것을 받아 같은 모양으로 그린다. */
export function OnboardingProgressBar({ step }: { step: OnboardingStep }) {
  const current = onboardingProgressIndex(step);
  return (
    <div
      role="progressbar"
      aria-label="가입 진행"
      aria-valuemin={1}
      aria-valuemax={ONBOARDING_PROGRESS_STEPS}
      aria-valuenow={current}
      className="flex flex-1 gap-x1"
    >
      {Array.from({ length: ONBOARDING_PROGRESS_STEPS }, (_, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: 고정 개수의 진행 칸
          key={i}
          className={`h-[3px] flex-1 rounded-full ${
            i < current ? "bg-bg-brand-solid" : "bg-bg-neutral-weak"
          }`}
        />
      ))}
    </div>
  );
}

interface OnboardingStepLayoutProps {
  /** 이 화면의 단계 (진행 표시). 없으면 진행 표시를 그리지 않는다. */
  step?: OnboardingStep;
  /** 제목 위에 꽉 차게 그리는 그림 (정원판 등). */
  hero?: ReactNode;
  title: string;
  description?: ReactNode;
  onBack?: () => void;
  children?: ReactNode;
  primary: { label: string; onClick: () => void; disabled?: boolean; loading?: boolean };
  /** "나중에 하기". */
  onLater?: () => void;
  laterLabel?: string;
  busy?: boolean;
  error?: string | null;
  /** 버튼 위에 붙는 안내 (비중 합계 등). */
  footerNote?: ReactNode;
}

/** 첫 가입 흐름의 한 단계 화면: 위 진행 표시, (그림), 제목, 스크롤 내용, 아래 고정 버튼. */
export function OnboardingStepLayout({
  step,
  hero,
  title,
  description,
  onBack,
  children,
  primary,
  onLater,
  laterLabel = "나중에 하기",
  busy = false,
  error,
  footerNote,
}: OnboardingStepLayoutProps) {
  return (
    <main className="bg-bg-layer-default text-fg-neutral flex h-dvh w-full flex-col pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-x12 w-full max-w-sm shrink-0 items-center gap-x3 px-x4">
        {onBack ? (
          <button
            type="button"
            aria-label="이전"
            onClick={onBack}
            disabled={busy}
            className="text-fg-neutral -ml-x2 flex size-x10 items-center justify-center rounded-full"
          >
            <IconChevronLeftLine width={24} height={24} />
          </button>
        ) : (
          <span className="size-x10 -ml-x2" aria-hidden />
        )}
        {step !== undefined && <OnboardingProgressBar step={step} />}
      </div>

      <div className="flex-1 overflow-y-auto px-x6">
        <div className="mx-auto flex w-full max-w-sm flex-col gap-x6 pt-x4 pb-x6">
          {hero}
          <div className="flex flex-col gap-x2">
            <h1 className="t8-bold break-keep">{title}</h1>
            {description && (
              <div className="t5-regular text-fg-neutral-muted break-keep">{description}</div>
            )}
          </div>
          {children}
        </div>
      </div>

      <div className="shrink-0 px-x6 pt-x3 pb-[calc(env(safe-area-inset-bottom)+16px)]">
        <div className="mx-auto flex w-full max-w-sm flex-col gap-x2">
          {error && (
            <div role="alert" className="pb-x1">
              <Callout tone="critical" description={error} />
            </div>
          )}
          {footerNote}
          <ActionButton
            variant="neutralSolid"
            size="large"
            disabled={primary.disabled || busy}
            loading={primary.loading}
            onClick={primary.onClick}
          >
            {primary.label}
          </ActionButton>
          {onLater && (
            <ActionButton variant="ghost" size="medium" disabled={busy} onClick={onLater}>
              {laterLabel}
            </ActionButton>
          )}
        </div>
      </div>
    </main>
  );
}
