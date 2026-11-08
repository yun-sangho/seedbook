"use client";

import type { ReactNode } from "react";
import { IconPlusLine } from "@karrotmarket/react-monochrome-icon";
import { Icon } from "@seed-design/react";
import { ActionButton } from "@web/seed-design/ui/action-button";

/*
 * 모바일 상세 화면 공용 조각 (계좌 상세, 포트폴리오 상세).
 * 화면 전체가 스크롤된다 — 탭 안쪽만 따로 스크롤하지 않는다.
 */

export function TabToolbar({ meta, children }: { meta?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex h-x12 items-center gap-x1 px-x4">
      {meta && (
        <span className="t3-regular text-fg-neutral-subtle min-w-0 flex-1 truncate whitespace-nowrap">
          {meta}
        </span>
      )}
      <div className="ml-auto flex items-center">{children}</div>
    </div>
  );
}

export function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <ActionButton variant="ghost" size="small" bleedX="asPadding" onClick={onClick}>
      <Icon svg={<IconPlusLine />} />
      {children}
    </ActionButton>
  );
}

/**
 * 박스 안의 "라벨 값 · [수정]" 한 줄. 보조 정보라 옅은 색·보통 굵기로 두고,
 * 편집은 오른쪽의 xsmall 버튼으로 연다 (행 전체가 아니라 버튼만 눌림).
 */
export function InlineAmount({
  label,
  value,
  onEdit,
}: {
  label: string;
  value: string;
  onEdit?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-x2">
      <span className="t5-regular text-fg-neutral-muted flex min-w-0 items-center gap-x1">
        <span>{label}</span>
        <span className="truncate tabular-nums">{value}</span>
      </span>
      {onEdit && (
        <ActionButton
          variant="neutralWeak"
          size="xsmall"
          onClick={onEdit}
          aria-label={`${label} 수정`}
        >
          수정
        </ActionButton>
      )}
    </div>
  );
}

/** 편집 가능함을 알리는 밑줄 "수정" 표시. 실제 동작은 감싼 버튼/행이 맡는다. */
export function EditHint() {
  return (
    <span className="t3-medium text-fg-neutral-muted underline underline-offset-2" aria-hidden>
      수정
    </span>
  );
}

export function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="t4-regular text-fg-neutral-subtle px-x4 py-x6 text-center">{children}</p>;
}
