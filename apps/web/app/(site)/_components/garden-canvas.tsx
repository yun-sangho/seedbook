"use client";

import dynamic from "next/dynamic";
import type { GardenCanvasProps } from "@mobile/features/garden/components/garden-canvas";

/**
 * 소개 사이트의 3D 정원 캔버스. 앱의 `GardenCanvas` (React.lazy) 와 같은 구현을 쓰되, 서버 렌더에서
 * three 를 돌리지 않도록 `ssr: false` 로 브라우저에서만 받아 온다.
 */
export const GardenCanvas = dynamic<GardenCanvasProps>(
  () => import("@mobile/features/garden/components/garden-canvas-impl"),
  { ssr: false }
);
