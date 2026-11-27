"use client";

import { useEffect, useRef } from "react";
import { createPlantScene, type PlantSceneHandle } from "../plant-3d/plant-renderer";
import type { GardenCanvasProps } from "./garden-canvas";

const COLOR_SCHEME_ATTRIBUTE = "data-seed-user-color-scheme";

/**
 * 3D 정원 캔버스 본체. three 를 담고 있어 직접 쓰지 말고 `garden-canvas.tsx` 의 `GardenCanvas`
 * (늦게 불러오는 래퍼) 를 쓴다.
 */
export default function GardenCanvasImpl({
  slots,
  layoutWidth,
  garden,
  anchor = "center",
  focus = null,
  paused = false,
  onPick,
  onMetrics,
  className,
}: GardenCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<PlantSceneHandle | null>(null);
  const callbacks = useRef({ onPick, onMetrics });
  callbacks.current = { onPick, onMetrics };
  // 장면을 새로 만들 때 지금 식물·포커스를 바로 넣는다.
  const latest = useRef({ slots, layoutWidth, focus });
  latest.current = { slots, layoutWidth, focus };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // 장면마다 새 캔버스를 쓴다. 지운 장면은 컨텍스트를 돌려주므로(forceContextLoss) 같은 캔버스를
    // 다시 쓰면 죽은 컨텍스트를 받는다 (StrictMode 의 두 번 마운트 등).
    const canvas = document.createElement("canvas");
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    container.appendChild(canvas);
    let handle: PlantSceneHandle;
    try {
      handle = createPlantScene(canvas, {
        garden,
        anchor,
        onPick: (index, target) => callbacks.current.onPick?.(index, target),
        onMetrics: (metrics) => callbacks.current.onMetrics?.(metrics),
      });
    } catch {
      // WebGL 을 못 쓰는 기기: 정지 이미지로 대체할 자리 (시안에서는 문구만).
      canvas.remove();
      container.textContent = "이 기기에서는 3D 를 그릴 수 없어요";
      return;
    }
    handleRef.current = handle;
    // 앱 색 모드(SEED `data-seed-user-color-scheme`)를 따라 조명 톤을 바꾼다.
    const root = document.documentElement;
    const applyTone = () => handle.setNight(root.getAttribute(COLOR_SCHEME_ATTRIBUTE) === "dark");
    applyTone();
    const toneObserver = new MutationObserver(applyTone);
    toneObserver.observe(root, { attributes: true, attributeFilter: [COLOR_SCHEME_ATTRIBUTE] });
    handle.setPlants(latest.current.slots, latest.current.layoutWidth);
    handle.focus(latest.current.focus);
    return () => {
      toneObserver.disconnect();
      handle.dispose();
      handleRef.current = null;
      canvas.remove();
    };
  }, [garden, anchor]);

  useEffect(() => {
    handleRef.current?.setPlants(slots, layoutWidth);
  }, [slots, layoutWidth]);

  useEffect(() => {
    handleRef.current?.focus(focus);
  }, [focus]);

  useEffect(() => {
    handleRef.current?.setPaused(paused);
  }, [paused]);

  return <div ref={containerRef} className={className} />;
}
