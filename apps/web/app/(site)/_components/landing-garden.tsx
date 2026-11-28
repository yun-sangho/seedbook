"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlantSceneMetrics } from "@mobile/features/garden/plant-3d/plant-renderer";
import { cn } from "@mobile/lib/utils";
import { GardenCanvas } from "@web/app/(site)/_components/garden-canvas";
import {
  type GardenEnvironment,
  LANDING_STILL_SIZE,
  type LandingGardenScene,
  landingGardenSlots,
  shouldLoad3d,
} from "./landing-garden-scenes";

/** 브라우저가 3D 를 그릴 수 있고, 사용자가 모션 줄이기·데이터 절약을 켜지 않았는지. */
function probeEnvironment(): GardenEnvironment {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  let webgl = false;
  try {
    const probe = document.createElement("canvas");
    webgl = Boolean(probe.getContext("webgl2") ?? probe.getContext("webgl"));
  } catch {
    webgl = false;
  }
  return {
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    saveData: Boolean(connection?.saveData),
    webgl,
  };
}

/** 첫 화면을 다 그린 뒤 브라우저가 한가할 때 3D 를 받는다. */
function whenIdle(callback: () => void): () => void {
  if ("requestIdleCallback" in window) {
    const id = window.requestIdleCallback(callback, { timeout: 2500 });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(callback, 1200);
  return () => clearTimeout(id);
}

/**
 * 소개 페이지의 정원. 처음에는 같은 장면의 정지 이미지를 보이고(LCP), 브라우저가 한가해지면 3D 정원
 * (`GardenCanvas`, three 약 143 KB gzip)을 받아 첫 프레임이 그려진 뒤 겹쳐 띄운다. 끌어서 돌려 볼
 * 수 있다. 식물에 다가가는 포커스는 넓은 화면에서 큰 식물 위쪽이 잘려 쓰지 않는다.
 */
export function LandingGarden({
  scene,
  alt,
  priority = false,
  className,
}: {
  scene: LandingGardenScene;
  alt: string;
  priority?: boolean;
  className?: string;
}) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [load3d, setLoad3d] = useState(false);
  const [ready, setReady] = useState(false);
  const [{ slots, width }] = useState(() => landingGardenSlots(scene));
  // 3D 로 바꾸기 전에 보여 주는 같은 장면의 정지 이미지 크기.
  const still = LANDING_STILL_SIZE[scene];

  // 화면에 들어온 뒤 한가할 때 3D 를 받는다. 화면 밖에서 렌더를 멈추는 것은 장면이 알아서 한다.
  useEffect(() => {
    const area = areaRef.current;
    if (!area || !shouldLoad3d(probeEnvironment())) return;
    let cancelIdle: (() => void) | null = null;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting && !cancelIdle) cancelIdle = whenIdle(() => setLoad3d(true));
    });
    observer.observe(area);
    return () => {
      observer.disconnect();
      cancelIdle?.();
    };
  }, []);

  const onMetrics = useCallback((metrics: PlantSceneMetrics) => {
    if (metrics.firstFrameAt !== null) setReady(true);
  }, []);

  return (
    <div
      ref={areaRef}
      className={cn("garden-sky relative overflow-hidden", className)}
      style={{ aspectRatio: `${still.width} / ${still.height}` }}
    >
      <picture>
        <source srcSet={`/landing/${scene}-dark.webp`} media="(prefers-color-scheme: dark)" />
        <img
          src={`/landing/${scene}-light.webp`}
          alt={alt}
          width={still.width}
          height={still.height}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          className={cn(
            "absolute inset-0 h-full w-full transition-opacity duration-500",
            ready && "opacity-0"
          )}
        />
      </picture>
      {load3d && (
        <GardenCanvas
          slots={slots}
          layoutWidth={width}
          garden
          onMetrics={onMetrics}
          className={cn(
            "absolute inset-0 transition-opacity duration-500",
            ready ? "opacity-100" : "opacity-0"
          )}
        />
      )}
    </div>
  );
}
