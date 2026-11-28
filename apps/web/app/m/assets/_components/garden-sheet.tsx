"use client";

import {
  type PointerEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { bottomSheetHandle } from "@seed-design/css/recipes/bottom-sheet-handle";
import { clampSheetHeight, sheetSnap } from "@web/features/garden/utils/sheet-snap";

/** 머리만 보일 때 높이 (손잡이 + 총 평가금액). */
const PEEK_HEIGHT = 100;
/**
 * 중간 높이 = 영역 절반에서 이만큼 뺀 높이 (px). 처음 열 때 이 높이 — 정원 받침 앞쪽 끝(영역 세로
 * 가운데) 바로 아래에서 시트가 시작한다.
 */
const MIDDLE_GAP = 16;
/** 끄는 것으로 보는 최소 이동 (px). 그보다 작으면 탭 (높이 바꾸기). */
const DRAG_SLOP = 6;
const SNAP_MS = 260;
/** SEED `BottomSheet.Handle` 과 같은 손잡이 막대 (색·크기·누름 색). */
const handleClasses = bottomSheetHandle();

/**
 * 정원 홈의 끌 수 있는 바텀시트. 부모(`position: relative`) 영역의 아래에 붙고, 머리(`header`)를
 * 끌면 처음(중간) / 전체 높이 중 하나에 멈춘다 — 처음 높이보다 아래로는 끌어 내릴 수 없다. 머리를
 * 탭하면 중간 ↔ 전체로 바뀐다.
 * 본문(`children`)은 시트 안에서 스스로 스크롤한다.
 *
 * `collapsed` 가 true 가 되면 머리만 남기고 내려가고, false 로 돌아오면 그 전 높이로 다시 올라온다
 * (식물 포커스). 머리만 남는 높이는 이때만 쓰고, 접힌 동안에는 머리만 / 중간 / 전체로 끌 수 있다. `floating` 은 시트 바로 위에 떠서 시트와 함께 움직인다.
 */
export function GardenSheet({
  areaRef,
  header,
  children,
  scrollRef,
  onScroll,
  collapsed = false,
  floating,
}: {
  /** 시트가 놓이는 영역. 이 높이로 멈춤 높이를 정한다. */
  areaRef: RefObject<HTMLElement | null>;
  header: ReactNode;
  children: ReactNode;
  scrollRef?: RefObject<HTMLDivElement | null>;
  onScroll?: () => void;
  collapsed?: boolean;
  floating?: ReactNode;
}) {
  const [areaHeight, setAreaHeight] = useState(0);
  const [height, setHeight] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  // 머리를 누르고 있는 동안 손잡이를 SEED 누름 색으로 바꾼다 (손잡이 밖 머리를 눌러도).
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const observer = new ResizeObserver(() => setAreaHeight(area.clientHeight));
    observer.observe(area);
    setAreaHeight(area.clientHeight);
    return () => observer.disconnect();
  }, [areaRef]);

  const middle =
    areaHeight > 0 ? Math.max(PEEK_HEIGHT, Math.round(areaHeight / 2 - MIDDLE_GAP)) : PEEK_HEIGHT;
  // 가장 높이: 정원 영역 끝(종가 기준 배너 바로 아래)까지.
  const top = Math.max(middle, areaHeight);
  // 평소에는 처음 높이 아래로 내릴 수 없다. 식물 포커스로 접혔을 때만 머리만 남는 높이가 있다.
  const snaps = collapsed ? [PEEK_HEIGHT, middle, top] : [middle, top];
  // 영역 크기가 바뀌면 (회전 등) 지금 높이를 멈춤 높이 안으로 다시 묶는다.
  const shown = clampSheetHeight(height ?? middle, snaps);

  // 접힐 때 높이를 기억해 두었다가 풀리면 되돌린다.
  const beforeCollapse = useRef<number | null>(null);
  const wasCollapsed = useRef(collapsed);
  useEffect(() => {
    if (collapsed === wasCollapsed.current) return;
    wasCollapsed.current = collapsed;
    if (collapsed) {
      beforeCollapse.current = height;
      setHeight(PEEK_HEIGHT);
    } else {
      setHeight(beforeCollapse.current);
      beforeCollapse.current = null;
    }
  }, [collapsed, height]);

  const drag = useRef<{
    startY: number;
    startHeight: number;
    lastY: number;
    lastAt: number;
    velocity: number;
    moved: boolean;
  } | null>(null);

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      setPressed(true);
      drag.current = {
        startY: event.clientY,
        startHeight: shown,
        lastY: event.clientY,
        lastAt: performance.now(),
        velocity: 0,
        moved: false,
      };
    },
    [shown]
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const state = drag.current;
      if (!state) return;
      const dy = state.startY - event.clientY;
      if (!state.moved && Math.abs(dy) < DRAG_SLOP) return;
      if (!state.moved) {
        state.moved = true;
        setDragging(true);
      }
      const now = performance.now();
      // 위로 끌면 양수 (커지는 쪽).
      state.velocity = (state.lastY - event.clientY) / Math.max(now - state.lastAt, 1);
      state.lastY = event.clientY;
      state.lastAt = now;
      setHeight(clampSheetHeight(state.startHeight + dy, snaps));
    },
    [snaps]
  );

  const onPointerUp = useCallback(() => {
    const state = drag.current;
    drag.current = null;
    setDragging(false);
    setPressed(false);
    if (!state) return;
    if (!state.moved) {
      // 탭: 머리만 → 중간, 중간 → 전체, 전체 → 중간.
      setHeight(state.startHeight < middle ? middle : state.startHeight < top ? top : middle);
      return;
    }
    setHeight(sheetSnap(shown, state.velocity, snaps));
  }, [snaps, middle, top, shown]);

  return (
    <section
      aria-label="정원 목록"
      className="bg-bg-layer-floating absolute inset-x-0 bottom-0 z-[1] flex flex-col rounded-t-[20px] shadow-[0_-4px_16px_rgba(0,0,0,0.18)]"
      style={{
        height: shown,
        transition: dragging ? "none" : `height ${SNAP_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`,
      }}
    >
      {floating && (
        <div className="pointer-events-none absolute inset-x-0 bottom-full flex justify-center pb-x3">
          <div className="pointer-events-auto">{floating}</div>
        </div>
      )}
      {/* 머리 전체를 끌 수 있다. 키보드·보조기기는 손잡이 버튼으로 높이를 바꾼다. */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="shrink-0 cursor-grab touch-none select-none"
      >
        <div className="flex justify-center">
          <button
            type="button"
            aria-label={shown < top ? "목록 펼치기" : "목록 줄이기"}
            onClick={(event) => {
              // 포인터 탭은 onPointerUp 이 처리한다. 키보드(Enter·Space)일 때만 여기서 바꾼다.
              if (event.detail !== 0) return;
              setHeight(shown < top ? top : middle);
            }}
            className="relative h-x5 w-x16"
          >
            <span className={handleClasses.root} data-active={pressed || undefined} />
          </button>
        </div>
        {header}
      </div>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
    </section>
  );
}
