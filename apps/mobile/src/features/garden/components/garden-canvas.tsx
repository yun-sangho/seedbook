"use client";

import { lazy, Suspense } from "react";
import type { GardenAnchor, PlantSceneMetrics, PlantSlot } from "../plant-3d/plant-renderer";

export interface GardenCanvasProps {
  /** 그릴 식물과 자리. 정원 배치는 `gardenLayout()` 으로 구한다. */
  slots: PlantSlot[];
  /** 배치 가로 폭 (`gardenLayout().width`). 정원 전체 카메라 거리를 정한다. */
  layoutWidth: number;
  /** true 면 바닥 판을 깔고 탭으로 식물을 고른다. false 면 식물 하나를 크게 (돌려 보기만). */
  garden: boolean;
  /** 다가갈 식물 (slots 의 index). null 이면 정원 전체. 바뀌면 카메라가 부드럽게 옮겨 간다. */
  focus?: number | null;
  /** 정원을 화면 어디에 둘지 (`groundEdge`: 받침 앞쪽 끝이 화면 세로 가운데). 기본 `center`. */
  anchor?: GardenAnchor;
  /** true 면 렌더 루프를 멈춘다 (아래 목록 스크롤 중 등). */
  paused?: boolean;
  /** 탭한 식물 (빈 곳이면 null). `badge` 는 리밸런싱 `!` 배지를 눌렀는지. */
  onPick?: (index: number | null, target: { badge: boolean }) => void;
  /** FPS·첫 프레임·전환 측정값 (개발·측정용). */
  onMetrics?: (metrics: PlantSceneMetrics) => void;
  className?: string;
}

const GardenCanvasImpl = lazy(() => import("./garden-canvas-impl"));

/**
 * 3D 정원 캔버스. three(약 145 KB gzip)는 이 컴포넌트가 화면에 그려질 때 따로 받아 오므로, 이 컴포넌트를
 * 쓰는 경로의 첫 JS 에는 들어가지 않는다. 받아 오는 동안은 아무것도 그리지 않는다.
 *
 * 서버 렌더가 있는 소개 사이트(apps/web)는 이 파일 대신 `next/dynamic` (`ssr: false`) 으로 감싼
 * 자기 래퍼를 쓴다 — three 는 브라우저에서만 돈다.
 */
export function GardenCanvas(props: GardenCanvasProps) {
  return (
    <Suspense fallback={null}>
      <GardenCanvasImpl {...props} />
    </Suspense>
  );
}
