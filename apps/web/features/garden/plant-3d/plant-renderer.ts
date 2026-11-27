import * as THREE from "three";
import { type BuiltPlant, buildPlant } from "./build-plant";
import { PLANT_STAGES, type PlantOptions } from "./plant-options";
import { REBALANCE_BADGE_KEY } from "./rebalance-badge";

/**
 * 식물 여러 그루를 한 WebGL 컨텍스트에 그리는 장면. 정원도 캔버스 하나(컨텍스트 하나)로 그린다 —
 * 모바일 WebView 는 동시에 살아 있는 WebGL 컨텍스트 수가 적다 (iOS 약 8~16개).
 */

export interface PlantSceneMetrics {
  /** 장면 생성 → 첫 프레임까지 (ms). */
  firstFrameMs: number | null;
  /** 첫 프레임 시각 (performance.now, 페이지 기준). */
  firstFrameAt: number | null;
  /** 최근 1초 프레임 수. */
  fps: number;
  /** 최근 1초 프레임 시간 중 가장 긴 것 (ms). */
  worstFrameMs: number;
  drawCalls: number;
  triangles: number;
  /** 마지막 포커스 전환(다가가기·물러나기) 동안의 평균 FPS·가장 긴 프레임. */
  transition: { fps: number; worstFrameMs: number; durationMs: number } | null;
}

export interface PlantSlot {
  /** 식물 구분 (포트폴리오 id). 같은 id 의 식물이 더 자라면 쑥 커지는 연출을 한다. */
  id?: string;
  options: PlantOptions;
  x: number;
  z: number;
}

export interface PlantSceneHandle {
  setPlants(slots: PlantSlot[], layoutWidth: number): void;
  /** 식물 하나로 카메라를 옮긴다. null 이면 전체 보기. */
  focus(index: number | null): void;
  /** 렌더 루프를 잠시 멈춘다 (아래 목록을 스크롤하는 동안 GPU·메인 스레드를 비운다). */
  setPaused(paused: boolean): void;
  dispose(): void;
}

interface SceneConfig {
  /** 바닥 판(정원)을 그릴지. 정원 모드면 탭으로 식물을 고를 수 있다. */
  garden: boolean;
  onMetrics?: (metrics: PlantSceneMetrics) => void;
  /** 정원에서 탭한 식물 (빈 곳이면 null). `badge` 는 리밸런싱 배지를 눌렀는지. */
  onPick?: (index: number | null, target: { badge: boolean }) => void;
}

function addLights(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight("#FFF8EC", "#B9A78E", 1.7));
  const sun = new THREE.DirectionalLight("#FFFFFF", 1.9);
  sun.position.set(3, 5, 4);
  scene.add(sun);
}

function buildGround(): THREE.Mesh {
  const geometry = new THREE.CylinderGeometry(1, 1.03, 0.18, 48);
  const material = new THREE.MeshToonMaterial({ color: "#BFE0A6" });
  const ground = new THREE.Mesh(geometry, material);
  ground.position.y = -0.09;
  return ground;
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) material.dispose();
    }
  });
}

const FOV = 30;
/** 탭으로 볼 최대 이동 거리(px)와 시간(ms). 넘으면 돌리기로 본다. */
const TAP_SLOP = 8;
const TAP_MS = 450;
/** 카메라가 목표에 다가가는 빠르기 (1/초). */
const CAMERA_EASE = 5.5;
/** 한 단계 자랐을 때 쑥 커지는 연출 길이 (ms) 와 시작 크기. */
const GROW_POP_MS = 900;
const GROW_POP_FROM = 0.55;

/** 0 → 1 로 가며 조금 넘쳤다 돌아오는 곡선 (easeOutBack). */
function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

/** 같은 식물이 더 높은 단계로 바뀌었는지 (자람 연출을 할지). id 가 다르면 다른 식물이다. */
export function grewAtSlot(before: PlantSlot | undefined, after: PlantSlot): boolean {
  if (!before || before.id !== after.id) return false;
  return PLANT_STAGES.indexOf(after.options.stage) > PLANT_STAGES.indexOf(before.options.stage);
}

export function createPlantScene(canvas: HTMLCanvasElement, config: SceneConfig): PlantSceneHandle {
  const createdAt = performance.now();
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "low-power",
  });
  // 고해상도 화면에서 3배까지 그리면 픽셀 수가 9배라 2배로 묶는다.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  addLights(scene);
  const ground = config.garden ? buildGround() : null;
  if (ground) scene.add(ground);

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 80);
  const turntable = new THREE.Group();
  scene.add(turntable);

  let plants: { built: BuiltPlant; key: string; slot: PlantSlot; popStart?: number }[] = [];
  let layoutWidth = 0;
  let focused: number | null = null;

  // 카메라는 지금 위치·바라보는 점에서 목표로 부드럽게 다가간다.
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const wantPos = new THREE.Vector3();
  const wantLook = new THREE.Vector3();
  let cameraPlaced = false;

  function overviewCamera() {
    if (!config.garden) {
      // 식물 하나: 나무 크기까지 들어오게 고정 (단계가 바뀌어도 크기 비교가 되게).
      const distance = 6.2 * Math.max(1, 0.75 / camera.aspect);
      wantLook.set(0, 1.25, 0);
      wantPos.set(0, 1.25 + distance * 0.3, distance);
      return;
    }
    // 정원 폭(화분 지름 포함)이 가로에 들어오는 거리.
    const halfWidth = layoutWidth / 2 + 0.9;
    const hFov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * camera.aspect);
    const fitWidth = halfWidth / Math.tan(hFov / 2);
    const distance = Math.max(fitWidth * 1.05, 7.5);
    wantLook.set(0, 0.9, 0);
    wantPos.set(0, 0.9 + distance * 0.42, distance);
  }

  const focusWorld = new THREE.Vector3();
  function focusCamera(index: number) {
    const plant = plants[index];
    if (!plant) return;
    plant.built.root.getWorldPosition(focusWorld);
    // 패널이 아래를 가리니 식물이 화면 위쪽에 오도록 바라보는 점을 조금 내린다.
    const distance = 5.2 * Math.max(1, 0.7 / camera.aspect);
    wantLook.set(focusWorld.x, focusWorld.y + 0.85, focusWorld.z);
    wantPos.set(focusWorld.x, focusWorld.y + 0.85 + distance * 0.28, focusWorld.z + distance);
  }

  function updateCameraTarget() {
    if (focused === null) overviewCamera();
    else focusCamera(focused);
  }

  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    updateCameraTarget();
    if (!cameraPlaced) {
      camPos.copy(wantPos);
      camLook.copy(wantLook);
      cameraPlaced = true;
    }
  }

  // --- 손가락으로 돌리기 (관성 포함). OrbitControls 대신 회전 한 축만 직접 처리한다.
  // 정원 전체일 땐 판을, 식물에 다가가 있을 땐 그 식물만 돌린다.
  let yaw = config.garden ? 0 : -0.35;
  let velocity = 0;
  let dragging = false;
  let lastX = 0;
  let lastMoveAt = 0;
  let downX = 0;
  let downY = 0;
  let downAt = 0;
  const yawLimit = () => (config.garden && focused === null ? 0.45 : Number.POSITIVE_INFINITY);
  const plantYaw = new Map<number, number>();

  function getYaw() {
    return focused === null ? yaw : (plantYaw.get(focused) ?? 0);
  }
  function setYaw(value: number) {
    const limited = THREE.MathUtils.clamp(value, -yawLimit(), yawLimit());
    if (focused === null) yaw = limited;
    else plantYaw.set(focused, limited);
  }

  function onPointerDown(event: PointerEvent) {
    dragging = true;
    lastX = event.clientX;
    downX = event.clientX;
    downY = event.clientY;
    downAt = performance.now();
    lastMoveAt = downAt;
    velocity = 0;
    canvas.setPointerCapture(event.pointerId);
  }
  function onPointerMove(event: PointerEvent) {
    if (!dragging) return;
    const now = performance.now();
    const delta = ((event.clientX - lastX) / Math.max(canvas.clientWidth, 1)) * Math.PI * 1.4;
    setYaw(getYaw() + delta);
    velocity = delta / Math.max(now - lastMoveAt, 1);
    lastX = event.clientX;
    lastMoveAt = now;
  }
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  function pick(event: PointerEvent): { index: number | null; badge: boolean } {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(
      plants.map((p) => p.built.root),
      true
    );
    // 배지는 늘 위에 그려지므로(depthTest 끔) 먼저 본다.
    const sorted = [...hits].sort(
      (a, b) =>
        Number(Boolean(b.object.userData[REBALANCE_BADGE_KEY])) -
        Number(Boolean(a.object.userData[REBALANCE_BADGE_KEY]))
    );
    for (const hit of sorted) {
      let node: THREE.Object3D | null = hit.object;
      while (node && node.parent !== turntable) node = node.parent;
      const index = plants.findIndex((p) => p.built.root === node);
      if (index >= 0) return { index, badge: Boolean(hit.object.userData[REBALANCE_BADGE_KEY]) };
    }
    return { index: null, badge: false };
  }
  function onPointerUp(event: PointerEvent) {
    dragging = false;
    const moved = Math.hypot(event.clientX - downX, event.clientY - downY);
    if (config.garden && moved < TAP_SLOP && performance.now() - downAt < TAP_MS) {
      velocity = 0;
      const picked = pick(event);
      config.onPick?.(picked.index, { badge: picked.badge });
    }
  }
  function onPointerCancel() {
    dragging = false;
  }
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);
  canvas.style.touchAction = "pan-y";

  // --- 렌더 루프. 화면 밖이거나 탭이 숨으면 멈춘다 (배터리).
  const metrics: PlantSceneMetrics = {
    firstFrameMs: null,
    firstFrameAt: null,
    fps: 0,
    worstFrameMs: 0,
    drawCalls: 0,
    triangles: 0,
    transition: null,
  };
  let frames = 0;
  let windowStart = performance.now();
  let worst = 0;
  let lastFrame = performance.now();
  let visible = true;
  let running = false;
  let paused = false;
  /** 포커스 전환 측정: 시작 시각, 프레임 수, 가장 긴 프레임. */
  let transition: { start: number; frames: number; worst: number } | null = null;

  function frame() {
    const now = performance.now();
    const dt = Math.min(now - lastFrame, 100);
    lastFrame = now;
    if (!dragging && Math.abs(velocity) > 0.00001) {
      setYaw(getYaw() + velocity * dt);
      velocity *= 0.92 ** (dt / 16.7);
    }
    turntable.rotation.y = yaw;
    plants.forEach((plant, i) => {
      plant.built.root.rotation.y = plantYaw.get(i) ?? 0;
    });
    const time = now / 1000;
    // sizeAttenuation 을 끈 스프라이트는 scale 1 이 화면 높이의 projection[5]/2 배라 px 로 바꾼다.
    const pxToScale = 2 / (camera.projectionMatrix.elements[5] * Math.max(canvas.clientHeight, 1));
    for (const plant of plants) {
      plant.built.update(time, pxToScale);
      if (plant.popStart !== undefined) {
        const t = Math.min(1, (now - plant.popStart) / GROW_POP_MS);
        plant.built.root.scale.setScalar(GROW_POP_FROM + (1 - GROW_POP_FROM) * easeOutBack(t));
        if (t >= 1) plant.popStart = undefined;
      }
    }

    updateCameraTarget();
    const ease = 1 - Math.exp((-CAMERA_EASE * dt) / 1000);
    camPos.lerp(wantPos, ease);
    camLook.lerp(wantLook, ease);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    renderer.render(scene, camera);

    if (transition) {
      transition.frames++;
      transition.worst = Math.max(transition.worst, dt);
      if (camPos.distanceTo(wantPos) < 0.01) {
        const durationMs = now - transition.start;
        metrics.transition = {
          fps: Math.round((transition.frames * 1000) / Math.max(durationMs, 1)),
          worstFrameMs: Math.round(transition.worst),
          durationMs: Math.round(durationMs),
        };
        transition = null;
        config.onMetrics?.({ ...metrics });
      }
    }

    if (metrics.firstFrameMs === null) {
      metrics.firstFrameMs = now - createdAt;
      metrics.firstFrameAt = now;
      config.onMetrics?.({ ...metrics });
    }
    frames++;
    if (frames > 1) worst = Math.max(worst, dt);
    if (now - windowStart >= 1000) {
      metrics.fps = Math.round((frames * 1000) / (now - windowStart));
      metrics.worstFrameMs = Math.round(worst);
      metrics.drawCalls = renderer.info.render.calls;
      metrics.triangles = renderer.info.render.triangles;
      config.onMetrics?.({ ...metrics });
      frames = 0;
      worst = 0;
      windowStart = now;
    }
  }

  function wake() {
    if (running || paused || !visible || document.hidden) return;
    running = true;
    lastFrame = performance.now();
    windowStart = lastFrame;
    frames = 0;
    renderer.setAnimationLoop(frame);
  }
  function sleep() {
    running = false;
    renderer.setAnimationLoop(null);
  }
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
    if (visible) wake();
    else sleep();
  });
  intersection.observe(canvas);
  function onVisibility() {
    if (document.hidden) sleep();
    else wake();
  }
  document.addEventListener("visibilitychange", onVisibility);
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);

  // WebView 가 메모리 압박으로 컨텍스트를 빼앗으면 다시 그릴 수 있게 기본 동작을 막는다.
  function onContextLost(event: Event) {
    event.preventDefault();
    sleep();
  }
  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", wake);

  resize();
  wake();

  return {
    setPlants(slots, width) {
      layoutWidth = width;
      const next: typeof plants = [];
      slots.forEach((slot, i) => {
        const key = JSON.stringify(slot);
        const existing = plants[i];
        if (existing && existing.key === key) {
          next.push(existing);
          return;
        }
        if (existing) {
          turntable.remove(existing.built.root);
          existing.built.dispose();
        }
        const built = buildPlant(slot.options);
        built.root.position.set(slot.x, 0, slot.z);
        turntable.add(built.root);
        const grew = grewAtSlot(existing?.slot, slot);
        if (grew) built.root.scale.setScalar(GROW_POP_FROM);
        next.push({ built, key, slot, popStart: grew ? performance.now() : undefined });
      });
      for (const stale of plants.slice(slots.length)) {
        turntable.remove(stale.built.root);
        stale.built.dispose();
      }
      plants = next;
      if (ground) {
        // 판 크기는 식물 배치에 맞춘다 (타원).
        const layoutDepth = Math.max(0, ...slots.map((s) => Math.abs(s.z))) * 2;
        ground.scale.set(width / 2 + 1.3, 1, layoutDepth / 2 + 1.15);
      }
      if (focused !== null && focused >= plants.length) focused = null;
      updateCameraTarget();
    },
    focus(index) {
      if (index === focused) return;
      focused = index;
      velocity = 0;
      if (index === null) {
        // 판이 많이 돌아가 있으면 정면으로 돌려 놓는다.
        yaw = THREE.MathUtils.clamp(yaw, -0.45, 0.45);
      }
      transition = { start: performance.now(), frames: 0, worst: 0 };
    },
    setPaused(next) {
      paused = next;
      if (paused) sleep();
      else wake();
    },
    dispose() {
      sleep();
      intersection.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", wake);
      for (const plant of plants) plant.built.dispose();
      if (ground) disposeObject(ground);
      renderer.dispose();
      // WebView 는 컨텍스트 수가 적어 화면을 떠날 때 바로 돌려준다.
      renderer.forceContextLoss();
    },
  };
}
