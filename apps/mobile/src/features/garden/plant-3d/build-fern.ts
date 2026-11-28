import * as THREE from "three";
import { createBlossoms } from "./blossom";
import { type PlantOptions, type PlantStage, wiltSag } from "./plant-options";

/**
 * 보스턴고사리 몸통 (시안). `buildPlant` 가 `kind: "fern"` 일 때 화분·그림자·기울기·흔들림·배지는 그대로 두고
 * 몸통만 이걸로 그린다. 씨앗은 나무와 모양은 같고 색(연두)만 달라 어떤 식물이 될지 알 수 있다.
 * 4단계(꽃·열매)는 나무와 같은 꽃(`blossom.ts`)이 잎줄기 위에 피고, 열매가 열리면 잎줄기 아래에 매달린다.
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
  wilt: "#B59A3C",
  seed: "#9BD38A",
  seedHighlight: "#DDF4D2",
} as const;

/** 꽃·열매 단계: 꽃을 피울 잎줄기 수(둘레에 고르게), 열매를 달 잎줄기 수(바깥 고리). */
const FLOWER_FRONDS = 6;
const FRUIT_FRONDS = 3;

/** 늘어짐 1 일 때 잎줄기가 더 숙여지는 각도(라디안). 모양(아치)에도 따로 늘어짐을 넣는다. */
const SAG_PITCH = 0.3;

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
  /** 색 → 재질 (buildPlant 의 캐시). 꽃·열매가 쓴다. */
  material(color: THREE.Color): THREE.Material;
  /** 다 쓰면 dispose 할 지오메트리 (buildPlant 가 모은다). */
  geometries: THREE.BufferGeometry[];
  /** 흔들릴 잎 (buildPlant 의 update 가 `rotation.x` 를 basePitch 둘레로 흔든다). */
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
  /** 늘어짐 (`wiltSag`). */
  sag: number
): { geometry: THREE.BufferGeometry; curve: THREE.CubicBezierCurve3 } {
  const mb = new MeshBuilder();
  const curve = frondCurve(spec);
  const rachisColor = mixColor(COLORS.rachis, COLORS.wilt, sag * 0.5);
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
  const fall = 0.12 + sag * 0.35; // 소엽이 아래로 처지는 정도
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

  return { geometry: mb.build(), curve };
}

/** 동그랗게 말린 새순 (fiddlehead): 위로 선 줄기 끝이 앞(+Z)으로 말려 들어간다. */
function fiddleheadGeometry(height: number, coil: number, wilt: number): THREE.BufferGeometry {
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
  const base = mixColor(COLORS.fiddlehead, COLORS.wilt, wilt * 0.6);
  const tip = mixColor(COLORS.fiddleheadTip, COLORS.wilt, wilt * 0.6);
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
    material(mixColor(COLORS.seed, "#8E7A63", ctx.options.wilt * 0.6))
  );
  seed.scale.set(1.25, 0.95, 0.95);
  seed.position.set(0, 0.075, 0);
  seed.rotation.z = 0.5;
  const highlight = new THREE.Mesh(highlightGeo, material(new THREE.Color(COLORS.seedHighlight)));
  highlight.position.set(-0.085, 0.16, 0.085);
  body.add(seed, highlight);
}

/**
 * 꽃: 잎줄기 `FLOWER_FRONDS` 개의 아치 꼭대기 위에 하나씩. 열매(`ripe`): 바깥 고리 잎줄기 `FRUIT_FRONDS` 개의
 * 내려가기 시작하는 곳 윗면에 하나씩. 잎줄기에 붙여 같이 흔들리고, 시들어 잎줄기가
 * 떨어지면 함께 사라진다. 난수를 쓰지 않아 열매가 열려도 다른 배치는 그대로다.
 */
function addBlossoms(
  ctx: FernBuildContext,
  fronds: readonly { group: THREE.Group; curve: THREE.CubicBezierCurve3; inner: boolean }[]
) {
  const blossoms = createBlossoms(ctx.options.wilt, ctx.material, (geometry) =>
    ctx.geometries.push(geometry)
  );
  const point = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const frondUp = new THREE.Vector3();
  // 꽃은 둘레에 고르게 (모든 잎줄기에서 띄엄띄엄), 아치 꼭대기 근처 윗면에.
  const flowerStep = Math.max(1, Math.floor(fronds.length / FLOWER_FRONDS));
  for (let i = 0; i < FLOWER_FRONDS; i++) {
    const frond = fronds[(i * flowerStep) % fronds.length];
    if (!frond) continue;
    const s = frond.inner ? 0.42 : 0.3;
    frond.curve.getPoint(s, point);
    frond.curve.getTangent(s, tangent);
    frondUp.crossVectors(tangent, RIGHT).normalize();
    // 위를 보고 피되 잎줄기 윗면 쪽으로 조금 기운다.
    const normal = frondUp.clone().add(UP).normalize();
    blossoms.addFlower(frond.group, point.clone().addScaledVector(frondUp, 0.03), normal);
  }
  if (!ctx.options.ripe) return;
  // 열매는 바깥 고리 잎줄기가 내려가기 시작하는 곳의 윗면에 얹혀 위·옆에서 보인다.
  const outer = fronds.filter((f) => !f.inner);
  const fruitStep = Math.max(1, Math.floor(outer.length / FRUIT_FRONDS));
  for (let i = 0; i < FRUIT_FRONDS; i++) {
    const frond = outer[(i * fruitStep + 1) % outer.length];
    if (!frond) continue;
    const s = 0.52;
    frond.curve.getPoint(s, point);
    frond.curve.getTangent(s, tangent);
    frondUp.crossVectors(tangent, RIGHT).normalize();
    blossoms.addFruit(frond.group, point.clone().addScaledVector(frondUp, 0.07));
  }
}

export function buildFernBody(ctx: FernBuildContext, body: THREE.Group): FernBody {
  const { stage, wilt } = ctx.options;
  const sag = wiltSag(wilt);

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
  const fade = (color: string) => mixColor(color, COLORS.wilt, wilt * 0.7);

  const golden = 2.399963;
  const azimuthStart = ctx.rand() * Math.PI * 2;
  /** 꽃·열매를 달 잎줄기. */
  const fronds: { group: THREE.Group; curve: THREE.CubicBezierCurve3; inner: boolean }[] = [];
  let index = 0;
  for (const ring of spec.rings) {
    for (let i = 0; i < ring.count; i++) {
      const jitter = 0.9 + ctx.rand() * 0.2;
      const frondSpec: FrondSpec = {
        length: ring.length * jitter,
        rise: ring.rise * (1 - sag * 0.45),
        hang: ring.hang + sag * 0.5,
        pairs: ring.pairs,
        color: fade(ring.inner ? COLORS.frondInner : COLORS.frond),
        tipColor: fade(COLORS.frondTip),
      };
      const { geometry, curve } = frondGeometry(frondSpec, sag);
      const pivot = new THREE.Group();
      const azimuth = azimuthStart + index * golden + (ctx.rand() - 0.5) * 0.25;
      pivot.rotation.y = azimuth;
      pivot.position.set(Math.sin(azimuth) * 0.04, 0, Math.cos(azimuth) * 0.04);
      const frond = new THREE.Group();
      const basePitch = (ring.inner ? -0.05 : 0.05) + sag * SAG_PITCH;
      frond.rotation.x = basePitch;
      frond.add(new THREE.Mesh(track(geometry), material));
      pivot.add(frond);
      body.add(pivot);
      ctx.leaves.push({ mesh: frond, basePitch, phase: ctx.rand() * Math.PI * 2 });
      fronds.push({ group: frond, curve, inner: ring.inner === true });
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
    const basePitch = -0.08 + (fiddleheads.length > 1 ? 0.12 : 0) + sag * 0.5;
    head.rotation.x = basePitch;
    head.add(new THREE.Mesh(track(fiddleheadGeometry(f.height, f.coil, wilt)), material));
    pivot.add(head);
    body.add(pivot);
    ctx.leaves.push({ mesh: head, basePitch, phase: ctx.rand() * Math.PI * 2 });
  });

  if (stage === "bloom") addBlossoms(ctx, fronds);

  return {
    badgeHeight: BADGE_HEIGHT[stage],
    update() {},
    dispose() {
      for (const dispose of disposers) dispose();
    },
  };
}
