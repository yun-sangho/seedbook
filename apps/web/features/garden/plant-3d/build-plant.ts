import * as THREE from "three";
import { buildFernBody } from "./build-fern";
import { leafGeometry, veinGeometry } from "./leaf-geometry";
import { PLANT_STAGES, type PlantOptions, type PlantStage, POT_COLORS } from "./plant-options";
import { createRebalanceBadge } from "./rebalance-badge";

/**
 * 코드로 만드는(procedural) 포트폴리오 식물. 이미지·모델 파일 없이 three 기본 도형만 쓴다.
 * 그림체는 카툰: 3단 툰 셰이딩(`MeshToonMaterial`) + 둥근 면 + 잎맥.
 *
 * 좌표: 화분 바닥이 y=0, 흙 표면이 `SOIL_Y`. 식물 몸통(`body`)은 흙 표면을 축으로 기울고 흔들린다.
 */

const SOIL_Y = 0.62;

const COLORS = {
  leaf: "#3E9F4C",
  leafLight: "#5DB565",
  leafDark: "#2F8A40",
  vein: "#B9E3B5",
  stem: "#4E9A48",
  trunk: "#8B5E3C",
  seed: "#F0C070",
  seedHighlight: "#FFE3B0",
  soil: "#5E3F2A",
  droop: "#A9A24C",
  petal: "#F8B3CB",
  petalCenter: "#FFD66B",
  fruit: "#E8664F",
} as const;

/** 처짐 1 일 때 잎이 더 숙여지는 각도(라디안). */
const DROOP_PITCH = 0.85;
/** 리밸런싱이 필요할 때 몸통이 기우는 각도(라디안, 약 18°). */
const TILT_ANGLE = 0.32;

/** 단계별로 리밸런싱 배지를 띄울 높이 (식물 꼭대기 옆). */
const BADGE_HEIGHT: Record<PlantStage, number> = {
  seed: 1.0,
  sprout: 1.35,
  sapling: 1.9,
  tree: 2.75,
  bloom: 2.75,
};

export interface BuiltPlant {
  root: THREE.Group;
  /**
   * 매 프레임 호출 (초 단위 시간). `pxToScale` 은 화면 1 CSS px 에 해당하는 스프라이트 크기
   * (`sizeAttenuation: false` 기준) — 배지를 화면 픽셀로 맞출 때 쓴다.
   */
  update(time: number, pxToScale: number): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// 작은 도우미
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mixColor(a: string, b: string, t: number): THREE.Color {
  return new THREE.Color(a).lerp(new THREE.Color(b), THREE.MathUtils.clamp(t, 0, 1));
}

/** 툰 셰이딩 3단 (어두운 면·중간·밝은 면). 모든 재질이 같이 쓴다. */
let toonGradient: THREE.DataTexture | null = null;
function getToonGradient(): THREE.DataTexture {
  if (!toonGradient) {
    toonGradient = new THREE.DataTexture(new Uint8Array([110, 190, 255]), 3, 1, THREE.RedFormat);
    toonGradient.minFilter = THREE.NearestFilter;
    toonGradient.magFilter = THREE.NearestFilter;
    toonGradient.generateMipmaps = false;
    toonGradient.needsUpdate = true;
  }
  return toonGradient;
}

/** 같은 색 재질은 한 번만 만든다. */
class MaterialKit {
  private cache = new Map<string, THREE.Material>();

  get(color: THREE.ColorRepresentation, options: { doubleSide?: boolean } = {}): THREE.Material {
    const c = new THREE.Color(color);
    const key = `${c.getHexString()}:${options.doubleSide ? 2 : 1}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const material = new THREE.MeshToonMaterial({
      color: c,
      gradientMap: getToonGradient(),
      side: options.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    });
    this.cache.set(key, material);
    return material;
  }

  dispose() {
    for (const material of this.cache.values()) material.dispose();
    this.cache.clear();
  }
}

/** 둥근 덩어리 (잎 뭉치·열매). */
function blobGeometry(radius: number): THREE.BufferGeometry {
  return new THREE.SphereGeometry(radius, 20, 14);
}

// ---------------------------------------------------------------------------
// 단계별 식물
// ---------------------------------------------------------------------------

interface LeafRecord {
  mesh: THREE.Object3D;
  basePitch: number;
  phase: number;
}

interface BuildContext {
  options: PlantOptions;
  rand: () => number;
  kit: MaterialKit;
  geometries: THREE.BufferGeometry[];
  leaves: LeafRecord[];
  leafGeo: THREE.BufferGeometry;
  veinGeo: THREE.BufferGeometry;
}

function track<T extends THREE.BufferGeometry>(ctx: BuildContext, geometry: T): T {
  ctx.geometries.push(geometry);
  return geometry;
}

/** 처질수록 노란 올리브 쪽으로 바랜다. */
function leafColor(ctx: BuildContext, base: string): THREE.Color {
  return mixColor(base, COLORS.droop, ctx.options.droop * 0.65);
}

function addLeaf(
  ctx: BuildContext,
  parent: THREE.Object3D,
  at: THREE.Vector3,
  azimuth: number,
  pitch: number,
  size: number,
  color: THREE.ColorRepresentation
) {
  const pivot = new THREE.Group();
  pivot.position.copy(at);
  pivot.rotation.y = azimuth;
  const leaf = new THREE.Group();
  const basePitch = pitch + ctx.options.droop * DROOP_PITCH;
  leaf.rotation.x = basePitch;
  leaf.scale.setScalar(size);
  leaf.add(new THREE.Mesh(ctx.leafGeo, ctx.kit.get(color, { doubleSide: true })));
  leaf.add(new THREE.Mesh(ctx.veinGeo, ctx.kit.get(COLORS.vein, { doubleSide: true })));
  pivot.add(leaf);
  parent.add(pivot);
  ctx.leaves.push({ mesh: leaf, basePitch, phase: ctx.rand() * Math.PI * 2 });
}

/** 줄기. 처지면 끝이 옆으로 휘며 내려온다. */
function stemTube(ctx: BuildContext, height: number, radius: number, lean: number) {
  const droopBend = ctx.options.droop * 0.18 * height;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(lean * 0.4, height * 0.45, 0),
    new THREE.Vector3(lean + droopBend * 0.6, height * 0.85, 0),
    new THREE.Vector3(lean + droopBend, height - droopBend * 0.5, 0),
  ]);
  const geometry = track(ctx, new THREE.TubeGeometry(curve, 12, radius, 8, false));
  return { mesh: new THREE.Mesh(geometry, ctx.kit.get(COLORS.stem)), curve };
}

function buildSeed(ctx: BuildContext, body: THREE.Group) {
  const color = mixColor(COLORS.seed, "#8E7A63", ctx.options.droop * 0.6);
  const seed = new THREE.Mesh(track(ctx, blobGeometry(0.16)), ctx.kit.get(color));
  seed.scale.set(1.25, 0.95, 0.95);
  seed.position.set(0, 0.075, 0);
  seed.rotation.z = 0.5;
  body.add(seed);
  const highlight = new THREE.Mesh(
    track(ctx, blobGeometry(0.042)),
    ctx.kit.get(COLORS.seedHighlight)
  );
  highlight.position.set(-0.085, 0.16, 0.085);
  body.add(highlight);
}

function buildSprout(ctx: BuildContext, body: THREE.Group) {
  const { mesh, curve } = stemTube(ctx, 0.4, 0.028, 0.02);
  body.add(mesh);
  const top = curve.getPoint(1);
  addLeaf(ctx, body, top, 0, 1.05, 0.5, leafColor(ctx, COLORS.leaf));
  addLeaf(ctx, body, top, Math.PI, 1.05, 0.5, leafColor(ctx, COLORS.leafLight));
}

function buildSapling(ctx: BuildContext, body: THREE.Group) {
  const { mesh, curve } = stemTube(ctx, 1.0, 0.035, 0.05);
  body.add(mesh);
  const golden = 2.399963;
  const count = 6;
  for (let i = 0; i < count; i++) {
    const t = 0.3 + (i / (count - 1)) * 0.55;
    const color = leafColor(ctx, i % 2 === 0 ? COLORS.leaf : COLORS.leafLight);
    const azimuth = i * golden + ctx.rand() * 0.3;
    addLeaf(ctx, body, curve.getPoint(t), azimuth, 1.1 - t * 0.2, 0.42 + (1 - t) * 0.1, color);
  }
  const top = curve.getPoint(1);
  addLeaf(ctx, body, top, 0.4, 0.45, 0.32, leafColor(ctx, COLORS.leafLight));
  addLeaf(ctx, body, top, 0.4 + Math.PI, 0.45, 0.28, leafColor(ctx, COLORS.leaf));
}

/** 꽃·열매를 붙일 잎 뭉치 자리 (중심, 반지름). */
type CanopySpot = { center: THREE.Vector3; radius: number };

function buildTree(ctx: BuildContext, body: THREE.Group): CanopySpot[] {
  const { droop } = ctx.options;
  const trunkHeight = 1.15;
  const trunk = new THREE.Mesh(
    track(ctx, new THREE.CylinderGeometry(0.06, 0.11, trunkHeight, 12, 3)),
    ctx.kit.get(COLORS.trunk)
  );
  trunk.position.y = trunkHeight / 2;
  body.add(trunk);

  const canopyCenter = new THREE.Vector3(0, trunkHeight + 0.28, 0);
  const blobSpecs: { center: THREE.Vector3; radius: number; color: string }[] = [
    { center: canopyCenter, radius: 0.55, color: COLORS.leaf },
  ];
  const branchSpecs = [
    { y: 0.62, azimuth: 0.3, length: 0.5 },
    { y: 0.78, azimuth: 2.4, length: 0.45 },
    { y: 0.92, azimuth: 4.3, length: 0.4 },
  ];
  const tilt = 0.85;
  branchSpecs.forEach((spec, i) => {
    const branch = new THREE.Mesh(
      track(ctx, new THREE.CylinderGeometry(0.025, 0.045, spec.length, 8)),
      ctx.kit.get(COLORS.trunk)
    );
    const dir = new THREE.Vector3(
      Math.sin(tilt) * Math.cos(spec.azimuth),
      Math.cos(tilt),
      -Math.sin(tilt) * Math.sin(spec.azimuth)
    );
    branch.position.set(0, spec.y, 0).addScaledVector(dir, spec.length / 2);
    branch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    body.add(branch);
    const end = new THREE.Vector3(0, spec.y, 0).addScaledVector(dir, spec.length);
    blobSpecs.push({
      center: end.add(new THREE.Vector3(0, 0.12, 0)),
      radius: 0.32 + ctx.rand() * 0.08,
      color: i % 2 === 0 ? COLORS.leafLight : COLORS.leafDark,
    });
  });
  // 꼭대기 작은 뭉치
  blobSpecs.push({
    center: canopyCenter.clone().add(new THREE.Vector3(0.08, 0.42, -0.05)),
    radius: 0.3,
    color: COLORS.leafLight,
  });

  const spots: CanopySpot[] = [];
  for (const spec of blobSpecs) {
    const blob = new THREE.Mesh(
      track(ctx, blobGeometry(spec.radius)),
      ctx.kit.get(leafColor(ctx, spec.color))
    );
    // 처지면 잎 뭉치가 아래로 내려앉고 납작해진다.
    const sag = droop * (0.08 + (spec.center.y - trunkHeight) * 0.12);
    blob.position.copy(spec.center).add(new THREE.Vector3(0, -sag, 0));
    blob.scale.set(1 + droop * 0.06, 1 - droop * 0.2, 1 + droop * 0.06);
    blob.rotation.set(ctx.rand() * 3, ctx.rand() * 3, ctx.rand() * 3);
    body.add(blob);
    spots.push({ center: blob.position.clone(), radius: spec.radius });
  }
  // 많이 처지면 아래로 늘어진 잎 몇 장
  if (droop > 0.25) {
    spots.slice(0, 4).forEach((spot, i) => {
      const at = spot.center.clone().add(new THREE.Vector3(0, -spot.radius * 0.7, 0));
      addLeaf(ctx, body, at, i * 1.7, 2.2, 0.18, leafColor(ctx, COLORS.leaf));
    });
  }
  return spots;
}

function buildBloom(ctx: BuildContext, body: THREE.Group) {
  const spots = buildTree(ctx, body);
  const { droop } = ctx.options;
  const petalGeo = track(ctx, blobGeometry(0.075));
  const centerGeo = track(ctx, blobGeometry(0.05));
  const fruitGeo = track(ctx, blobGeometry(0.075));
  const petalMat = ctx.kit.get(mixColor(COLORS.petal, "#C9B6A6", droop * 0.6));
  const centerMat = ctx.kit.get(COLORS.petalCenter);
  const fruitMat = ctx.kit.get(mixColor(COLORS.fruit, "#B07A5E", droop * 0.5));

  const up = new THREE.Vector3(0, 1, 0);
  spots.forEach((spot, i) => {
    const flowers = i === 0 ? 3 : 2;
    for (let f = 0; f < flowers; f++) {
      // 잎 뭉치 위쪽 반구의 무작위 방향
      const theta = ctx.rand() * Math.PI * 2;
      const phi = 0.3 + ctx.rand() * 0.9;
      const normal = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      );
      const flower = new THREE.Group();
      flower.position.copy(spot.center).addScaledVector(normal, spot.radius * 0.97);
      flower.quaternion.setFromUnitVectors(up, normal);
      for (let p = 0; p < 5; p++) {
        const petal = new THREE.Mesh(petalGeo, petalMat);
        const a = (p / 5) * Math.PI * 2;
        petal.position.set(Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08);
        petal.scale.set(1, 0.45, 1);
        flower.add(petal);
      }
      const center = new THREE.Mesh(centerGeo, centerMat);
      center.position.y = 0.02;
      flower.add(center);
      flower.scale.setScalar(1 - droop * 0.25);
      body.add(flower);
    }
    if (i > 0) {
      // 열매는 가지 끝 뭉치 아래쪽에 매달린다.
      const fruit = new THREE.Mesh(fruitGeo, fruitMat);
      const side = new THREE.Vector3(ctx.rand() - 0.5, 0, ctx.rand() - 0.5).normalize();
      fruit.position
        .copy(spot.center)
        .addScaledVector(side, spot.radius * 0.6)
        .add(new THREE.Vector3(0, -spot.radius * 0.75 - droop * 0.05, 0));
      body.add(fruit);
    }
  });
}

const STAGE_BUILDERS: Record<PlantStage, (ctx: BuildContext, body: THREE.Group) => void> = {
  seed: buildSeed,
  sprout: buildSprout,
  sapling: buildSapling,
  tree: buildTree,
  bloom: buildBloom,
};

// ---------------------------------------------------------------------------
// 화분·그림자
// ---------------------------------------------------------------------------

function buildPot(ctx: BuildContext, root: THREE.Group) {
  const colors = POT_COLORS[ctx.options.pot];
  const segments = 32;
  const profile = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.38, 0),
    new THREE.Vector2(0.42, 0.04),
    new THREE.Vector2(0.5, 0.5),
    new THREE.Vector2(0.48, 0.5),
    new THREE.Vector2(0.47, SOIL_Y - 0.02),
  ];
  root.add(
    new THREE.Mesh(track(ctx, new THREE.LatheGeometry(profile, segments)), ctx.kit.get(colors.body))
  );
  const rim = new THREE.Mesh(
    track(ctx, new THREE.CylinderGeometry(0.58, 0.55, 0.16, segments, 1, true)),
    ctx.kit.get(colors.rim, { doubleSide: true })
  );
  rim.position.y = 0.55;
  root.add(rim);
  const rimTop = new THREE.Mesh(
    track(ctx, new THREE.RingGeometry(0.5, 0.58, segments)),
    ctx.kit.get(colors.rim, { doubleSide: true })
  );
  rimTop.rotation.x = -Math.PI / 2;
  rimTop.position.y = 0.63;
  root.add(rimTop);
  const soil = new THREE.Mesh(
    track(ctx, new THREE.CircleGeometry(0.5, segments)),
    ctx.kit.get(COLORS.soil)
  );
  soil.rotation.x = -Math.PI / 2;
  soil.position.y = SOIL_Y - 0.03;
  root.add(soil);
}

/** 바닥에 까는 흐린 원형 그림자 (실제 그림자 계산은 비싸서 쓰지 않는다). */
function buildShadow(ctx: BuildContext, root: THREE.Group) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const c2d = canvas.getContext("2d");
  if (c2d) {
    const gradient = c2d.createRadialGradient(32, 32, 4, 32, 32, 32);
    gradient.addColorStop(0, "rgba(60,40,20,0.35)");
    gradient.addColorStop(1, "rgba(60,40,20,0)");
    c2d.fillStyle = gradient;
    c2d.fillRect(0, 0, 64, 64);
  }
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const shadow = new THREE.Mesh(track(ctx, new THREE.PlaneGeometry(1.7, 1.7)), material);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.003;
  shadow.renderOrder = -1;
  root.add(shadow);
  return () => {
    texture.dispose();
    material.dispose();
  };
}

// ---------------------------------------------------------------------------

export function buildPlant(options: PlantOptions): BuiltPlant {
  const kit = new MaterialKit();
  const ctx: BuildContext = {
    options,
    rand: mulberry32(options.seed),
    kit,
    geometries: [],
    leaves: [],
    leafGeo: leafGeometry(),
    veinGeo: veinGeometry(),
  };
  track(ctx, ctx.leafGeo);
  track(ctx, ctx.veinGeo);

  const root = new THREE.Group();
  const disposers = [buildShadow(ctx, root)];
  buildPot(ctx, root);

  const body = new THREE.Group();
  body.position.y = SOIL_Y - 0.03;
  root.add(body);
  const fern = options.kind === "fern" ? buildFernBody(ctx, body) : null;
  if (fern) disposers.push(fern.dispose);
  else STAGE_BUILDERS[options.stage](ctx, body);

  const baseTilt = options.needsRebalance ? -TILT_ANGLE : 0;
  const badge = options.needsRebalance
    ? createRebalanceBadge(fern?.badgeHeight ?? BADGE_HEIGHT[options.stage])
    : null;
  if (badge) {
    // 몸통이 기울어도 배지는 똑바로 서도록 root 에 붙인다.
    root.add(badge.object);
    disposers.push(badge.dispose);
  }

  const stageIndex = PLANT_STAGES.indexOf(options.stage);
  // 처질수록 흔들림이 느리고 작다 (기운 없는 느낌).
  const swayAmp = (0.012 + stageIndex * 0.004) * (1 - options.droop * 0.6);
  const swaySpeed = 1.2 - options.droop * 0.5;
  const phase = options.seed * 1.3;

  return {
    root,
    update(time, pxToScale) {
      body.rotation.z = baseTilt + Math.sin(time * swaySpeed + phase) * swayAmp;
      body.rotation.x = Math.sin(time * swaySpeed * 0.7 + phase) * swayAmp * 0.6;
      for (const leaf of ctx.leaves) {
        leaf.mesh.rotation.x = leaf.basePitch + Math.sin(time * 2.1 + leaf.phase) * 0.05;
      }
      fern?.update(time);
      badge?.update(time, pxToScale);
    },
    dispose() {
      for (const geometry of ctx.geometries) geometry.dispose();
      for (const dispose of disposers) dispose();
      kit.dispose();
    },
  };
}
