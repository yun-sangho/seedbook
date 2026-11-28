import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createBlossoms, FRUIT_RADIUS } from "./blossom";
import { buildFernBody } from "./build-fern";
import { leafGeometry, veinGeometry } from "./leaf-geometry";
import {
  PLANT_STAGES,
  type PlantOptions,
  type PlantStage,
  POT_COLORS,
  WILT_SHED_FROM,
  WILT_SHED_SHARE,
  wiltSag,
} from "./plant-options";
import { createRain } from "./rain";
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
  wilt: "#B59A3C",
  fallenLeaf: "#A8843E",
} as const;

/** 늘어짐 1 일 때 잎이 더 숙여지는 각도(라디안). */
const SAG_PITCH = 0.85;

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
  material(color: THREE.Color): THREE.Material;
  geometries: THREE.BufferGeometry[];
  leaves: LeafRecord[];
  leafGeo: THREE.BufferGeometry;
  veinGeo: THREE.BufferGeometry;
}

function track<T extends THREE.BufferGeometry>(ctx: BuildContext, geometry: T): T {
  ctx.geometries.push(geometry);
  return geometry;
}

/** 시들수록 누렇게 바랜다. */
function leafColor(ctx: BuildContext, base: string): THREE.Color {
  return mixColor(base, COLORS.wilt, ctx.options.wilt * 0.7);
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
  const basePitch = pitch + wiltSag(ctx.options.wilt) * SAG_PITCH;
  leaf.rotation.x = basePitch;
  leaf.scale.setScalar(size);
  leaf.add(new THREE.Mesh(ctx.leafGeo, ctx.kit.get(color, { doubleSide: true })));
  leaf.add(new THREE.Mesh(ctx.veinGeo, ctx.kit.get(COLORS.vein, { doubleSide: true })));
  pivot.add(leaf);
  parent.add(pivot);
  ctx.leaves.push({ mesh: leaf, basePitch, phase: ctx.rand() * Math.PI * 2 });
}

/** 줄기. 시들어 늘어지면 끝이 옆으로 휘며 내려온다. */
function stemTube(ctx: BuildContext, height: number, radius: number, lean: number) {
  const sagBend = wiltSag(ctx.options.wilt) * 0.18 * height;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(lean * 0.4, height * 0.45, 0),
    new THREE.Vector3(lean + sagBend * 0.6, height * 0.85, 0),
    new THREE.Vector3(lean + sagBend, height - sagBend * 0.5, 0),
  ]);
  // 관 끝이 뚫려 보이지 않게 끝을 둥글게 막는다 (같은 mesh 라 draw call 은 그대로).
  const tube = new THREE.TubeGeometry(curve, 12, radius, 8, false);
  const cap = new THREE.SphereGeometry(radius, 8, 6);
  const tip = curve.getPoint(1);
  cap.translate(tip.x, tip.y, tip.z);
  const geometry = track(ctx, mergeGeometries([tube, cap]));
  tube.dispose();
  cap.dispose();
  return { mesh: new THREE.Mesh(geometry, ctx.kit.get(COLORS.stem)), curve };
}

function buildSeed(ctx: BuildContext, body: THREE.Group) {
  const color = mixColor(COLORS.seed, "#8E7A63", ctx.options.wilt * 0.6);
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
/** `branch`: 가지 끝 뭉치 (열매가 매달리는 곳). */
type CanopySpot = { center: THREE.Vector3; radius: number; branch: boolean };

function buildTree(ctx: BuildContext, body: THREE.Group): CanopySpot[] {
  const sag = wiltSag(ctx.options.wilt);
  const trunkHeight = 1.15;
  const trunk = new THREE.Mesh(
    track(ctx, new THREE.CylinderGeometry(0.06, 0.11, trunkHeight, 12, 3)),
    ctx.kit.get(COLORS.trunk)
  );
  trunk.position.y = trunkHeight / 2;
  body.add(trunk);

  const canopyCenter = new THREE.Vector3(0, trunkHeight + 0.28, 0);
  const blobSpecs: { center: THREE.Vector3; radius: number; color: string; branch: boolean }[] = [
    { center: canopyCenter, radius: 0.55, color: COLORS.leaf, branch: false },
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
      branch: true,
    });
  });
  // 꼭대기 작은 뭉치
  blobSpecs.push({
    center: canopyCenter.clone().add(new THREE.Vector3(0.08, 0.42, -0.05)),
    radius: 0.3,
    color: COLORS.leafLight,
    branch: false,
  });

  const spots: CanopySpot[] = [];
  for (const spec of blobSpecs) {
    const blob = new THREE.Mesh(
      track(ctx, blobGeometry(spec.radius)),
      ctx.kit.get(leafColor(ctx, spec.color))
    );
    // 늘어지면 잎 뭉치가 아래로 내려앉고 납작해진다.
    const drop = sag * (0.08 + (spec.center.y - trunkHeight) * 0.12);
    blob.position.copy(spec.center).add(new THREE.Vector3(0, -drop, 0));
    blob.scale.set(1 + sag * 0.06, 1 - sag * 0.2, 1 + sag * 0.06);
    blob.rotation.set(ctx.rand() * 3, ctx.rand() * 3, ctx.rand() * 3);
    body.add(blob);
    spots.push({ center: blob.position.clone(), radius: spec.radius, branch: spec.branch });
  }
  // 많이 늘어지면 아래로 처진 잎 몇 장
  if (sag > 0.25) {
    spots.slice(0, 4).forEach((spot, i) => {
      const at = spot.center.clone().add(new THREE.Vector3(0, -spot.radius * 0.7, 0));
      addLeaf(ctx, body, at, i * 1.7, 2.2, 0.18, leafColor(ctx, COLORS.leaf));
    });
  }
  return spots;
}

/** 뭉치 하나에 다는 최대 열매 수·매달리는 각도(수평에서 아래로, 라디안). */
const MAX_FRUITS_PER_CLUMP = 2;
/** 나무 한 그루의 열매 수 범위 — 가지 끝 뭉치에 무작위로 나눠 단다. */
const FRUIT_TOTAL_MIN = 2;
const FRUIT_TOTAL_MAX = 3;
const FRUIT_HANG = 0.6;
/** 줄기 반대쪽에서 시작해 좌우로 넓혀 가며, 다른 뭉치에 묻히지 않는 자리를 고른다. */
const FRUIT_AZIMUTH_OFFSETS = [0.45, -0.45, 1.2, -1.2, 1.9, -1.9, 2.6, -2.6];

/** 뭉치마다 달 열매 수 (가지 끝 뭉치에만 무작위로 나눈다). 합은 FRUIT_TOTAL_MIN~MAX. */
function fruitsPerSpot(ctx: BuildContext, spots: CanopySpot[]): number[] {
  const counts = spots.map(() => 0);
  const total = FRUIT_TOTAL_MIN + Math.floor(ctx.rand() * (FRUIT_TOTAL_MAX - FRUIT_TOTAL_MIN + 1));
  for (let n = 0; n < total; n++) {
    const open = counts
      .map((count, i) => ({ count, i }))
      .filter(({ count, i }) => spots[i]?.branch && count < MAX_FRUITS_PER_CLUMP);
    const pick = open[Math.floor(ctx.rand() * open.length)];
    if (!pick) break;
    counts[pick.i] = pick.count + 1;
  }
  return counts;
}

function buildBloom(ctx: BuildContext, body: THREE.Group) {
  const spots = buildTree(ctx, body);
  const blossoms = createBlossoms(
    ctx.options.wilt,
    (color) => ctx.kit.get(color),
    (geometry) => track(ctx, geometry)
  );
  // 열매 자리는 열매가 없을 때도 정한다 — 난수를 같은 순서로 써서 열매가 열려도 꽃이 그 자리에 있게.
  const fruitCounts = fruitsPerSpot(ctx, spots);
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
      blossoms.addFlower(
        body,
        spot.center.clone().addScaledVector(normal, spot.radius * 0.97),
        normal
      );
    }
    const fruitCount = ctx.options.ripe ? (fruitCounts[i] ?? 0) : 0;
    if (fruitCount > 0) {
      // 열매는 가지 끝 뭉치의 바깥 아래쪽 표면에 매달린다 (뭉치 안에 묻히지 않게, 줄기 반대쪽).
      const outward = Math.atan2(spot.center.z, spot.center.x);
      const placed: THREE.Vector3[] = [];
      for (const offset of FRUIT_AZIMUTH_OFFSETS) {
        if (placed.length === fruitCount) break;
        const azimuth = outward + offset;
        const at = spot.center
          .clone()
          .addScaledVector(
            new THREE.Vector3(
              Math.cos(azimuth) * Math.cos(FRUIT_HANG),
              -Math.sin(FRUIT_HANG),
              Math.sin(azimuth) * Math.cos(FRUIT_HANG)
            ),
            spot.radius + FRUIT_RADIUS * 0.35
          );
        const buried = spots.some(
          (other) =>
            other !== spot && at.distanceTo(other.center) < other.radius + FRUIT_RADIUS * 0.35
        );
        const crowded = placed.some((p) => p.distanceTo(at) < FRUIT_RADIUS * 2.2);
        if (buried || crowded) continue;
        placed.push(at);
        blossoms.addFruit(body, at);
      }
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

/**
 * 많이 시들면 (`WILT_SHED_FROM` 이상) 잎(`ctx.leaves`)의 `WILT_SHED_SHARE` 를 시드로 골라 숨기고, 그만큼
 * (최대 3장) 흙 위에 떨어진 잎을 눕힌다. 잎 고르기는 따로 만든 난수를 써서 나머지 배치에 영향이 없다.
 */
function shedLeaves(ctx: BuildContext, root: THREE.Group) {
  if (ctx.options.wilt < WILT_SHED_FROM || ctx.leaves.length === 0) return;
  const rand = mulberry32(ctx.options.seed ^ 0x5eed);
  const order = ctx.leaves.map((leaf) => ({ leaf, key: rand() }));
  order.sort((a, b) => a.key - b.key);
  const count = Math.round(ctx.leaves.length * WILT_SHED_SHARE);
  const shed = new Set(order.slice(0, count).map(({ leaf }) => leaf));
  for (const leaf of shed) leaf.mesh.visible = false;
  // 숨긴 잎은 흔들 필요가 없다.
  ctx.leaves = ctx.leaves.filter((leaf) => !shed.has(leaf));

  const material = ctx.kit.get(COLORS.fallenLeaf, { doubleSide: true });
  const fallen = Math.min(count, 3);
  for (let i = 0; i < fallen; i++) {
    const pivot = new THREE.Group();
    const angle = rand() * Math.PI * 2;
    const r = 0.12 + rand() * 0.22;
    pivot.position.set(Math.cos(angle) * r, SOIL_Y - 0.02, Math.sin(angle) * r);
    pivot.rotation.y = rand() * Math.PI * 2;
    const leaf = new THREE.Mesh(ctx.leafGeo, material);
    leaf.rotation.x = -Math.PI / 2 + 0.08;
    leaf.scale.setScalar(0.2 + rand() * 0.06);
    pivot.add(leaf);
    root.add(pivot);
  }
}

// ---------------------------------------------------------------------------

export function buildPlant(options: PlantOptions): BuiltPlant {
  const kit = new MaterialKit();
  const ctx: BuildContext = {
    options,
    rand: mulberry32(options.seed),
    kit,
    material: (color) => kit.get(color),
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
  // 빈 화분은 흙만 — 씨앗을 심으면(목표를 더하면) 그린다.
  const empty = options.empty === true && options.stage === "seed";
  const fern = !empty && options.kind === "fern" ? buildFernBody(ctx, body) : null;
  if (fern) disposers.push(fern.dispose);
  else if (!empty) STAGE_BUILDERS[options.stage](ctx, body);
  shedLeaves(ctx, root);

  const badgeHeight = fern?.badgeHeight ?? BADGE_HEIGHT[options.stage];
  const baseTilt = options.needsRebalance ? -TILT_ANGLE : 0;
  const badge = options.needsRebalance ? createRebalanceBadge(badgeHeight) : null;
  if (badge) {
    // 몸통이 기울어도 배지는 똑바로 서도록 root 에 붙인다.
    root.add(badge.object);
    disposers.push(badge.dispose);
  }

  // 비는 식물 위에만 내린다 — 식물(잎 색·처짐·흔들림)은 그대로다.
  const rain = createRain(
    options.rain,
    badgeHeight,
    options.seed,
    (color) => kit.get(color),
    // 흙 표면 바로 위 (흙 원판보다 살짝 높게).
    SOIL_Y - 0.025
  );
  if (rain) {
    root.add(rain.object);
    disposers.push(rain.dispose);
  }

  const stageIndex = PLANT_STAGES.indexOf(options.stage);
  const sag = wiltSag(options.wilt);
  // 시들면 작고 느리게 흔들린다 (기운 없는 느낌).
  const swayAmp = (0.012 + stageIndex * 0.004) * (1 - sag * 0.5);
  const swaySpeed = 1.2 - sag * 0.4;
  const flutterAmp = 0.05;
  const flutterSpeed = 2.1;
  const phase = options.seed * 1.3;

  return {
    root,
    update(time, pxToScale) {
      const t = time * swaySpeed + phase;
      body.rotation.z = baseTilt + Math.sin(t) * swayAmp;
      body.rotation.x = Math.sin(time * swaySpeed * 0.7 + phase) * swayAmp * 0.6;
      for (const leaf of ctx.leaves) {
        leaf.mesh.rotation.x =
          leaf.basePitch + Math.sin(time * flutterSpeed + leaf.phase) * flutterAmp;
      }
      fern?.update(time);
      rain?.update(time);
      badge?.update(time, pxToScale);
    },
    dispose() {
      for (const geometry of ctx.geometries) geometry.dispose();
      for (const dispose of disposers) dispose();
      kit.dispose();
    },
  };
}
