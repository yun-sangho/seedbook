import * as THREE from "three";
import type { PlantOptions, PlantStage } from "./plant-options";

/**
 * 보스턴고사리 몸통 (시안). `buildPlant` 가 `kind: "fern"` 일 때 화분·그림자·기울기·흔들림·배지는 그대로 두고
 * 몸통만 이걸로 그린다. 씨앗은 나무와 모양은 같고 색(연두)만 달라 어떤 식물이 될지 알 수 있다.
 *
 * 그림체는 나무와 같은 카툰 (3단 툰 셰이딩, 외곽선 없음). 작은 잎(소엽)이 수백 장이라 잎줄기(엽축)마다
 * 소엽·엽축을 정점 색이 있는 지오메트리 하나로 합친다 → 잎줄기 하나 = draw call 하나.
 *
 * 잎줄기 좌표: 바깥(+Z)으로 뻗고 위가 +Y, 소엽은 ±X 로 달린다. `rotation.x` 가 +면 끝이 내려간다.
 */

const COLORS = {
  frond: "#3E9F4C",
  frondTip: "#76C463",
  frondInner: "#4BAA52",
  rachis: "#3F8C3E",
  fiddlehead: "#8BCB68",
  fiddleheadTip: "#A8DB7E",
  droop: "#A9A24C",
  seed: "#9BD38A",
  seedHighlight: "#DDF4D2",
  dew: "#E4F6FF",
  dewHighlight: "#FFFFFF",
} as const;

/** 풍성 단계: 잎줄기마다 맺히는 이슬 수와 둘레에서 반짝이는 별 수. */
const DEW_PER_FROND = 1;
const SPARKLE_COUNT = 14;

/** 처짐 1 일 때 잎줄기가 더 숙여지는 각도(라디안). 모양(아치)에도 따로 처짐을 넣는다. */
const DROOP_PITCH = 0.3;

/** 단계별 리밸런싱 배지 높이 (화분 바닥 기준). */
const BADGE_HEIGHT: Record<PlantStage, number> = {
  seed: 1.0,
  sprout: 1.3,
  sapling: 1.65,
  tree: 2.0,
  bloom: 2.25,
};

export interface FernBuildContext {
  options: PlantOptions;
  rand: () => number;
  /** 다 쓰면 dispose 할 지오메트리 (buildPlant 가 모은다). */
  geometries: THREE.BufferGeometry[];
  /** 바람에 흔들릴 잎 (buildPlant 의 update 가 `rotation.x` 를 basePitch 둘레로 흔든다). */
  leaves: { mesh: THREE.Object3D; basePitch: number; phase: number }[];
}

export interface FernBody {
  badgeHeight: number;
  update(time: number): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// 재질·지오메트리 도우미
// ---------------------------------------------------------------------------

let toonGradient: THREE.DataTexture | null = null;
/** 나무(`build-plant.ts`)와 같은 3단 툰 셰이딩. */
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

function mixColor(a: THREE.ColorRepresentation, b: THREE.ColorRepresentation, t: number) {
  return new THREE.Color(a).lerp(new THREE.Color(b), THREE.MathUtils.clamp(t, 0, 1));
}

/** 정점·색·삼각형을 모아 지오메트리 하나로 만든다 (잎줄기 하나 = draw call 하나). */
class MeshBuilder {
  private positions: number[] = [];
  private colors: number[] = [];
  private indices: number[] = [];

  get vertexCount(): number {
    return this.positions.length / 3;
  }

  vertex(p: THREE.Vector3, c: THREE.Color): number {
    this.positions.push(p.x, p.y, p.z);
    this.colors.push(c.r, c.g, c.b);
    return this.positions.length / 3 - 1;
  }

  tri(a: number, b: number, c: number) {
    this.indices.push(a, b, c);
  }

  build(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setIndex(this.indices);
    geometry.computeVertexNormals();
    return geometry;
  }
}

const _side = new THREE.Vector3();
const _p = new THREE.Vector3();

/** 소엽 하나: 둥근 끝이 아래로 살짝 말리고 가장자리가 조금 올라온(오목한) 작은 잎. 삼각형 10개. */
function addLeaflet(
  mb: MeshBuilder,
  base: THREE.Vector3,
  axis: THREE.Vector3,
  up: THREE.Vector3,
  length: number,
  width: number,
  color: THREE.Color
) {
  _side.crossVectors(axis, up).normalize();
  const stations = [0, 0.32, 0.66];
  const widths = [0.45, 1, 0.78];
  const rows = stations.map((t, i) => {
    const curl = -t * t * length * 0.22;
    const w = (widths[i] ?? 0) * width;
    const center = base
      .clone()
      .addScaledVector(axis, t * length)
      .addScaledVector(up, curl);
    const cup = w * 0.28;
    const left = center.clone().addScaledVector(_side, w).addScaledVector(up, cup);
    const right = center.clone().addScaledVector(_side, -w).addScaledVector(up, cup);
    return {
      l: mb.vertex(left, color),
      m: mb.vertex(center, color),
      r: mb.vertex(right, color),
    };
  });
  _p.copy(base)
    .addScaledVector(axis, length)
    .addScaledVector(up, -length * 0.22);
  const tip = mb.vertex(_p, color);
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i];
    const b = rows[i + 1];
    if (!a || !b) continue;
    mb.tri(a.l, b.m, a.m);
    mb.tri(a.l, b.l, b.m);
    mb.tri(a.r, a.m, b.m);
    mb.tri(a.r, b.m, b.r);
  }
  const last = rows[rows.length - 1];
  if (last) {
    mb.tri(last.l, tip, last.m);
    mb.tri(last.r, last.m, tip);
  }
}

const _tangent = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _binormal = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);

/** 끝으로 갈수록 가늘어지는 관 (엽축·새순). 단면은 5각형 — 가늘어서 더 둥글게 할 필요가 없다. */
function addTaperedTube(
  mb: MeshBuilder,
  curve: THREE.Curve<THREE.Vector3>,
  segments: number,
  radius: (u: number) => number,
  color: (u: number) => THREE.Color
) {
  const radial = 5;
  const rings: number[][] = [];
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const center = curve.getPointAt(u);
    curve.getTangentAt(u, _tangent);
    const ref = Math.abs(_tangent.y) > 0.9 ? RIGHT : UP;
    _normal.crossVectors(_tangent, ref).normalize();
    _binormal.crossVectors(_tangent, _normal).normalize();
    const r = radius(u);
    const c = color(u);
    const ring: number[] = [];
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      _p.copy(center)
        .addScaledVector(_normal, Math.cos(a) * r)
        .addScaledVector(_binormal, Math.sin(a) * r);
      ring.push(mb.vertex(_p, c));
    }
    rings.push(ring);
  }
  for (let i = 0; i < segments; i++) {
    const a = rings[i];
    const b = rings[i + 1];
    if (!a || !b) continue;
    for (let k = 0; k < radial; k++) {
      const k2 = (k + 1) % radial;
      mb.tri(a[k] ?? 0, b[k] ?? 0, b[k2] ?? 0);
      mb.tri(a[k] ?? 0, b[k2] ?? 0, a[k2] ?? 0);
    }
  }
}

const _blobSphere = new THREE.SphereGeometry(1, 8, 6);

/** 둥근 덩어리 (이슬). 잎줄기 지오메트리에 합쳐 draw call 을 늘리지 않는다. */
function addBlob(
  mb: MeshBuilder,
  center: THREE.Vector3,
  radius: number,
  stretchY: number,
  color: THREE.Color
) {
  const position = _blobSphere.getAttribute("position");
  const index = _blobSphere.getIndex();
  const first = mb.vertexCount;
  for (let i = 0; i < position.count; i++) {
    _p.set(
      position.getX(i) * radius,
      position.getY(i) * radius * stretchY,
      position.getZ(i) * radius
    ).add(center);
    mb.vertex(_p, color);
  }
  if (!index) return;
  for (let i = 0; i < index.count; i += 3) {
    mb.tri(first + index.getX(i), first + index.getX(i + 1), first + index.getX(i + 2));
  }
}

// ---------------------------------------------------------------------------
// 잎줄기·새순
// ---------------------------------------------------------------------------

interface FrondSpec {
  /** 잎줄기 길이. */
  length: number;
  /** 아치가 올라가는 정도 (길이 대비). */
  rise: number;
  /** 끝이 늘어지는 정도 (길이 대비, 클수록 화분 아래로). */
  hang: number;
  /** 소엽 쌍 수. */
  pairs: number;
  color: THREE.Color;
  tipColor: THREE.Color;
}

/** 소엽 길이 비율: 밑동은 조금 짧고, 1/4 쯤에서 가장 길고, 끝으로 갈수록 짧아진다. */
function leafletProfile(s: number): number {
  return Math.min(1, 0.55 + 1.8 * s) * (1 - s ** 2.6);
}

function frondCurve(spec: FrondSpec): THREE.CubicBezierCurve3 {
  const { length: L, rise, hang } = spec;
  return new THREE.CubicBezierCurve3(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, rise * L * 0.95, L * 0.16),
    new THREE.Vector3(0, rise * L * 1.0, L * 0.62),
    // 끝은 화분 바닥 아래(받침 밑)로 내려가지 않게 한다.
    new THREE.Vector3(0, Math.max((rise * 0.35 - hang) * L, -0.4), L * 0.9)
  );
}

/** 잎줄기 하나 (엽축 + 양쪽 소엽) 를 지오메트리 하나로. */
function frondGeometry(
  spec: FrondSpec,
  droop: number,
  /** 잎줄기에 맺힐 이슬 수 (풍성 단계). */
  dew = 0,
  rand: () => number = Math.random
): { geometry: THREE.BufferGeometry; curve: THREE.CubicBezierCurve3 } {
  const mb = new MeshBuilder();
  const curve = frondCurve(spec);
  const rachisColor = mixColor(COLORS.rachis, COLORS.droop, droop * 0.5);
  addTaperedTube(
    mb,
    curve,
    12,
    (u) => 0.016 * (1 - u * 0.75),
    () => rachisColor
  );

  const leafletLength = 0.17 * spec.length;
  const point = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const frondUp = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const sideDir = new THREE.Vector3();
  const sweep = 0.5; // 소엽이 끝쪽으로 기우는 정도 (라디안)
  const fall = 0.12 + droop * 0.35; // 소엽이 아래로 처지는 정도
  for (let i = 0; i < spec.pairs; i++) {
    const s = 0.1 + (i / Math.max(spec.pairs - 1, 1)) * 0.88;
    curve.getPoint(s, point);
    curve.getTangent(s, tangent);
    frondUp.crossVectors(tangent, RIGHT).normalize();
    // crossVectors(T, +X) 는 T 가 +Z 일 때 +Y — 잎줄기 윗면.
    const len = leafletLength * leafletProfile(s);
    const color = spec.color.clone().lerp(spec.tipColor, s);
    for (const sign of [1, -1]) {
      sideDir.set(sign, 0, 0);
      axis
        .copy(sideDir)
        .multiplyScalar(Math.cos(sweep))
        .addScaledVector(tangent, Math.sin(sweep))
        .addScaledVector(frondUp, -fall)
        .normalize();
      // 소엽 윗면은 잎줄기 윗면 쪽. axis 와 수직이 되게 맞춘다.
      const up = frondUp.clone().addScaledVector(axis, -frondUp.dot(axis)).normalize();
      addLeaflet(mb, point, axis, up, len, len * 0.36, color);
    }
  }
  // 끝 소엽 하나
  curve.getPoint(1, point);
  curve.getTangent(1, tangent);
  frondUp.crossVectors(tangent, RIGHT).normalize();
  const tipUp = frondUp.clone().addScaledVector(tangent, -frondUp.dot(tangent)).normalize();
  addLeaflet(
    mb,
    point,
    tangent.clone(),
    tipUp,
    leafletLength * 0.35,
    leafletLength * 0.1,
    spec.tipColor
  );

  // 이슬: 소엽 끝에 맺힌 물방울 + 하얀 반사점. 잎줄기와 같이 흔들린다.
  const dewColor = new THREE.Color(COLORS.dew);
  const shineColor = new THREE.Color(COLORS.dewHighlight);
  for (let i = 0; i < dew; i++) {
    const s = 0.45 + ((i + rand()) / Math.max(dew, 1)) * 0.4;
    curve.getPoint(s, point);
    curve.getTangent(s, tangent);
    const side = rand() < 0.5 ? 1 : -1;
    const reach = leafletLength * leafletProfile(s) * (0.55 + rand() * 0.3);
    const at = point
      .clone()
      .add(new THREE.Vector3(side * reach, -0.035 - reach * 0.25, 0))
      .addScaledVector(tangent, reach * 0.4);
    const radius = 0.036 + rand() * 0.016;
    addBlob(mb, at, radius, 1.15, dewColor);
    addBlob(
      mb,
      at.clone().add(new THREE.Vector3(-radius * 0.35, radius * 0.45, radius * 0.6)),
      radius * 0.32,
      1,
      shineColor
    );
  }

  return { geometry: mb.build(), curve };
}

/** 동그랗게 말린 새순 (fiddlehead): 위로 선 줄기 끝이 앞(+Z)으로 말려 들어간다. */
function fiddleheadGeometry(height: number, coil: number, droop: number): THREE.BufferGeometry {
  const mb = new MeshBuilder();
  const points: THREE.Vector3[] = [];
  const stemSteps = 5;
  for (let i = 0; i <= stemSteps; i++) {
    const t = i / stemSteps;
    points.push(new THREE.Vector3(0, t * height, -coil * 0.25 * Math.sin(t * Math.PI)));
  }
  // 나선: 중심 (0, h, coil) 둘레로 반지름이 줄며 돈다. θ=0 이 줄기 끝(위로 향함).
  const turns = 2.1 * Math.PI;
  const coilSteps = 18;
  for (let i = 1; i <= coilSteps; i++) {
    const theta = (i / coilSteps) * turns;
    const r = coil * (1 - (theta / turns) * 0.72);
    points.push(new THREE.Vector3(0, height + r * Math.sin(theta), coil - r * Math.cos(theta)));
  }
  const curve = new THREE.CatmullRomCurve3(points);
  const base = mixColor(COLORS.fiddlehead, COLORS.droop, droop * 0.6);
  const tip = mixColor(COLORS.fiddleheadTip, COLORS.droop, droop * 0.6);
  const stemShare = height / (height + coil * 4);
  addTaperedTube(
    mb,
    curve,
    40,
    (u) => {
      // 줄기는 가늘고, 말린 부분은 통통하다가 가운데로 갈수록 가늘어진다.
      if (u < stemShare) return coil * 0.24;
      const k = (u - stemShare) / (1 - stemShare);
      return coil * (0.42 - k * 0.26);
    },
    (u) => base.clone().lerp(tip, u)
  );
  return mb.build();
}

// ---------------------------------------------------------------------------
// 4단계(풍성) 표시: 고사리는 꽃이 없어 잎 끝 이슬 + 둘레 반짝임으로 구분한다
// ---------------------------------------------------------------------------

function sparkleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const c2d = canvas.getContext("2d");
  if (c2d) {
    // 네 갈래 별 + 가운데 빛
    c2d.fillStyle = "#FFFFFF";
    c2d.beginPath();
    c2d.moveTo(32, 2);
    c2d.quadraticCurveTo(35, 29, 62, 32);
    c2d.quadraticCurveTo(35, 35, 32, 62);
    c2d.quadraticCurveTo(29, 35, 2, 32);
    c2d.quadraticCurveTo(29, 29, 32, 2);
    c2d.fill();
    const glow = c2d.createRadialGradient(32, 32, 0, 32, 32, 22);
    glow.addColorStop(0, "rgba(255,255,255,1)");
    glow.addColorStop(0.35, "rgba(255,244,190,0.85)");
    glow.addColorStop(1, "rgba(255,240,180,0)");
    c2d.fillStyle = glow;
    c2d.fillRect(0, 0, 64, 64);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// ---------------------------------------------------------------------------

interface StageSpec {
  rings: {
    count: number;
    length: number;
    rise: number;
    hang: number;
    pairs: number;
    inner?: boolean;
  }[];
  fiddleheads: { height: number; coil: number }[];
}

const STAGE_SPECS: Record<Exclude<PlantStage, "seed">, StageSpec> = {
  sprout: {
    rings: [],
    fiddleheads: [
      { height: 0.42, coil: 0.13 },
      { height: 0.26, coil: 0.095 },
    ],
  },
  sapling: {
    rings: [{ count: 5, length: 0.8, rise: 1.15, hang: 0.05, pairs: 13 }],
    fiddleheads: [{ height: 0.4, coil: 0.1 }],
  },
  tree: {
    rings: [
      { count: 7, length: 1.2, rise: 0.85, hang: 0.35, pairs: 19 },
      { count: 4, length: 1.05, rise: 1.3, hang: 0.05, pairs: 16, inner: true },
    ],
    fiddleheads: [],
  },
  bloom: {
    rings: [
      { count: 10, length: 1.5, rise: 0.8, hang: 0.75, pairs: 23 },
      { count: 7, length: 1.3, rise: 1.3, hang: 0.15, pairs: 20, inner: true },
    ],
    fiddleheads: [],
  },
};

/** 씨앗: 나무 씨앗(`build-plant.ts` buildSeed)과 같은 모양·자리, 색만 연두. */
function buildFernSeed(
  ctx: FernBuildContext,
  body: THREE.Group,
  material: (color: THREE.Color) => THREE.Material
) {
  const seedGeo = new THREE.SphereGeometry(0.16, 20, 14);
  const highlightGeo = new THREE.SphereGeometry(0.042, 20, 14);
  ctx.geometries.push(seedGeo, highlightGeo);
  const seed = new THREE.Mesh(
    seedGeo,
    material(mixColor(COLORS.seed, "#8E7A63", ctx.options.droop * 0.6))
  );
  seed.scale.set(1.25, 0.95, 0.95);
  seed.position.set(0, 0.075, 0);
  seed.rotation.z = 0.5;
  const highlight = new THREE.Mesh(highlightGeo, material(new THREE.Color(COLORS.seedHighlight)));
  highlight.position.set(-0.085, 0.16, 0.085);
  body.add(seed, highlight);
}

export function buildFernBody(ctx: FernBuildContext, body: THREE.Group): FernBody {
  const { stage, droop } = ctx.options;

  const material = new THREE.MeshToonMaterial({
    vertexColors: true,
    gradientMap: getToonGradient(),
    side: THREE.DoubleSide,
  });
  const disposers: (() => void)[] = [() => material.dispose()];
  const solid = (color: THREE.Color) => {
    const m = new THREE.MeshToonMaterial({ color, gradientMap: getToonGradient() });
    disposers.push(() => m.dispose());
    return m;
  };
  if (stage === "seed") {
    buildFernSeed(ctx, body, solid);
    return {
      badgeHeight: BADGE_HEIGHT.seed,
      update() {},
      dispose() {
        for (const dispose of disposers) dispose();
      },
    };
  }
  const spec = STAGE_SPECS[stage];
  const track = (geometry: THREE.BufferGeometry) => {
    ctx.geometries.push(geometry);
    return geometry;
  };
  const fade = (color: string) => mixColor(color, COLORS.droop, droop * 0.65);

  const golden = 2.399963;
  const azimuthStart = ctx.rand() * Math.PI * 2;
  /** 다른 고사리 장식(이슬)을 달 잎줄기. */
  const fronds: { group: THREE.Group; curve: THREE.CubicBezierCurve3 }[] = [];
  let index = 0;
  for (const ring of spec.rings) {
    for (let i = 0; i < ring.count; i++) {
      const jitter = 0.9 + ctx.rand() * 0.2;
      const frondSpec: FrondSpec = {
        length: ring.length * jitter,
        rise: ring.rise * (1 - droop * 0.45),
        hang: ring.hang + droop * 0.5,
        pairs: ring.pairs,
        color: fade(ring.inner ? COLORS.frondInner : COLORS.frond),
        tipColor: fade(COLORS.frondTip),
      };
      const dew = stage === "bloom" ? DEW_PER_FROND : 0;
      const { geometry, curve } = frondGeometry(frondSpec, droop, dew, ctx.rand);
      const pivot = new THREE.Group();
      const azimuth = azimuthStart + index * golden + (ctx.rand() - 0.5) * 0.25;
      pivot.rotation.y = azimuth;
      pivot.position.set(Math.sin(azimuth) * 0.04, 0, Math.cos(azimuth) * 0.04);
      const frond = new THREE.Group();
      const basePitch = (ring.inner ? -0.05 : 0.05) + droop * DROOP_PITCH;
      frond.rotation.x = basePitch;
      frond.add(new THREE.Mesh(track(geometry), material));
      pivot.add(frond);
      body.add(pivot);
      ctx.leaves.push({ mesh: frond, basePitch, phase: ctx.rand() * Math.PI * 2 });
      fronds.push({ group: frond, curve });
      index++;
    }
  }

  const fiddleheads = spec.fiddleheads;
  fiddleheads.forEach((f, i) => {
    const pivot = new THREE.Group();
    // 말린 면이 옆(화면 쪽)에서 보이도록 새순은 좌우로 향한다.
    const azimuth = Math.PI / 2 + i * Math.PI + (ctx.rand() - 0.5) * 0.4;
    pivot.rotation.y = azimuth;
    // 새순이 하나면 가운데, 여럿이면 가운데 둘레에 모여 난다.
    const offset = fiddleheads.length > 1 ? 0.05 + (i % 2) * 0.03 : 0;
    pivot.position.set(Math.sin(azimuth) * offset, 0, Math.cos(azimuth) * offset);
    const head = new THREE.Group();
    const basePitch = -0.08 + (fiddleheads.length > 1 ? 0.12 : 0) + droop * 0.5;
    head.rotation.x = basePitch;
    head.add(new THREE.Mesh(track(fiddleheadGeometry(f.height, f.coil, droop)), material));
    pivot.add(head);
    body.add(pivot);
    ctx.leaves.push({ mesh: head, basePitch, phase: ctx.rand() * Math.PI * 2 });
  });

  const sparkles: { sprite: THREE.Sprite; phase: number; size: number }[] = [];
  if (stage === "bloom") {
    // 반짝임: 식물 둘레에서 번갈아 반짝이는 별.
    const texture = sparkleTexture();
    const sparkleMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      color: "#FFF1A8",
    });
    disposers.push(
      () => texture.dispose(),
      () => sparkleMat.dispose()
    );
    const count = SPARKLE_COUNT;
    for (let i = 0; i < count; i++) {
      const sprite = new THREE.Sprite(sparkleMat);
      const a = (i / count) * Math.PI * 2 + ctx.rand() * 0.5;
      const r = 0.45 + ctx.rand() * 0.75;
      sprite.position.set(Math.cos(a) * r, 0.15 + ctx.rand() * 1.15, Math.sin(a) * r);
      const size = 0.34 + ctx.rand() * 0.16;
      sprite.scale.setScalar(size);
      body.add(sprite);
      sparkles.push({ sprite, phase: ctx.rand() * Math.PI * 2, size });
    }
  }

  return {
    badgeHeight: BADGE_HEIGHT[stage],
    update(time) {
      for (const sparkle of sparkles) {
        // 잠깐 반짝였다 사라진다 (sin 의 위쪽 끝만 쓴다). 재질을 같이 쓰므로 크기로만 깜빡인다.
        const twinkle = Math.max(0, Math.sin(time * 2.2 + sparkle.phase)) ** 3;
        sparkle.sprite.scale.setScalar(Math.max(sparkle.size * twinkle, 0.0001));
      }
    },
    dispose() {
      for (const dispose of disposers) dispose();
    },
  };
}
