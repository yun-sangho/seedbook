"use client";

import { type TouchEvent, useCallback, useEffect, useRef, useState } from "react";
import { IconChevronLeftLine } from "@karrotmarket/react-monochrome-icon";
import { Icon } from "@seed-design/react";
import type { LegalDocumentId } from "@seedbook/database/legal";
import { LegalDocumentView } from "@web/components/legal-document-view";
import { LEGAL_DOCUMENTS, type LegalDocumentTarget } from "@web/lib/legal-documents";

/** 화면 전환 시간 (SEED 스택과 비슷하게). */
const TRANSITION_MS = 300;
/** 이 너비 안에서 시작한 가로 스와이프만 "뒤로" 로 본다. */
const EDGE_WIDTH = 32;
/** 화면 너비의 이만큼 넘게 끌면 닫는다. */
const CLOSE_RATIO = 0.3;

/**
 * 스택(stackflow) 밖 화면(약관 동의 게이트)에서 약관을 여는 전체 화면 문서 보기. 사이트 페이지로
 * 나가지 않고 같은 화면 위에 덮어, 닫으면 아래 화면(체크 상태·스크롤)이 그대로 남는다.
 *
 * 뒤로가기: 앱바 뒤로 버튼, 왼쪽 가장자리 스와이프, Escape. Android 시스템 뒤로가기는 열린
 * dialog 를 Escape 로 닫으므로 (`lib/native/system-back.ts`) 그대로 이 화면이 닫힌다.
 */
export function LegalDocumentViewer({
  document,
  onClose,
}: {
  document: LegalDocumentId;
  onClose: () => void;
}) {
  // 다른 버전·본문 안 약관 링크는 이 화면 안에서 바꿔 연다 (동의 화면을 떠나지 않는다).
  const [target, setTarget] = useState<LegalDocumentTarget>({ document });
  const title = LEGAL_DOCUMENTS.find((d) => d.id === target.document)?.title ?? "";
  const [shown, setShown] = useState(false);
  const [dragX, setDragX] = useState<number | null>(null);
  const dragStart = useRef<number | null>(null);
  const closing = useRef(false);
  const backButton = useRef<HTMLButtonElement>(null);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    setDragX(null);
    setShown(false);
    window.setTimeout(() => onCloseRef.current(), TRANSITION_MS);
  }, []);

  // 들어올 때 오른쪽에서 밀려 들어오고, 포커스를 이 화면으로 옮긴다 (닫으면 연 버튼으로 돌려준다).
  useEffect(() => {
    const opener = globalThis.document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => setShown(true));
    backButton.current?.focus();
    return () => {
      cancelAnimationFrame(frame);
      opener?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    globalThis.document.addEventListener("keydown", onKeyDown);
    return () => globalThis.document.removeEventListener("keydown", onKeyDown);
  }, [close]);

  const onTouchStart = (event: TouchEvent) => {
    const x = event.touches[0]?.clientX ?? Number.POSITIVE_INFINITY;
    dragStart.current = x <= EDGE_WIDTH ? x : null;
  };
  const onTouchMove = (event: TouchEvent) => {
    if (dragStart.current === null) return;
    const x = event.touches[0]?.clientX ?? dragStart.current;
    setDragX(Math.max(0, x - dragStart.current));
  };
  const onTouchEnd = () => {
    if (dragStart.current === null) return;
    dragStart.current = null;
    if (dragX !== null && dragX > window.innerWidth * CLOSE_RATIO) close();
    else setDragX(null);
  };

  const transform = dragX !== null ? `translateX(${dragX}px)` : shown ? "none" : "translateX(100%)";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-open=""
      className="bg-bg-layer-default text-fg-neutral fixed inset-0 z-[900] flex flex-col"
      style={{
        transform,
        transition: dragX !== null ? "none" : `transform ${TRANSITION_MS}ms ease-out`,
        boxShadow: "-8px 0 24px rgb(0 0 0 / 0.12)",
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <header className="border-stroke-neutral-subtle grid shrink-0 grid-cols-[44px_1fr_44px] items-center border-b pt-[env(safe-area-inset-top)]">
        <button
          ref={backButton}
          type="button"
          aria-label="뒤로"
          onClick={close}
          className="flex h-[44px] items-center justify-center"
        >
          <Icon svg={<IconChevronLeftLine />} size="x6" />
        </button>
        <h2 className="t6-bold truncate text-center">{title}</h2>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
        <LegalDocumentView document={target.document} version={target.version} onOpen={setTarget} />
      </div>
    </div>
  );
}
