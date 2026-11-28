import type { PlantStage } from "../plant-3d/plant-options";
import { Flower, Fruit } from "./blossom-art";

/**
 * 보스턴고사리 2D 그림 (시안). `PlantAvatar` 의 64×64 좌표에 그린다 — 화분 테두리 윗면이 y=46, 가운데 x=32.
 * 3D(`plant-3d/build-fern.ts`)와 같은 모양: 가운데서 아치형으로 뻗는 잎줄기에 작은 잎이 양쪽으로 달린다.
 * 툰 셰이딩처럼 소엽 윗줄은 밝게, 아랫줄은 어둡게 칠한다. 늘어진 잎은 화분 앞으로 내려오므로
 * 화분 뒤(`back`)·앞(`front`) 두 층으로 나눠 그린다. 씨앗은 나무 씨앗과 모양은 같고 색(연두)만 다르다.
 */

const FROND = "#3E9F4C";
const FROND_LIGHT = "#5DB565";
const FROND_DARK = "#2F8A40";
const FROND_TIP = "#76C463";
const RACHIS = "#3F8C3E";
const FIDDLEHEAD = "#7CC05F";
const FIDDLEHEAD_LIGHT = "#A8DB7E";
const SEED = "#9BD38A";
const SEED_HIGHLIGHT = "#DDF4D2";

const BASE = { x: 32, y: 45.5 };

interface FrondSpec {
  /** 처음 뻗는 방향 (도, 0 = 위, 음수 = 왼쪽). */
  angle: number;
  length: number;
  /** 올라가는 높이 (길이 대비). */
  rise: number;
  /** 끝이 내려오는 정도 (길이 대비). */
  hang: number;
  layer: "back" | "front";
}

interface Leaflet {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rotate: number;
  light: boolean;
}

interface FrondShape {
  rachis: string;
  leaflets: Leaflet[];
  end: { x: number; y: number };
}

function frondShape(spec: FrondSpec): FrondShape {
  const rad = (spec.angle * Math.PI) / 180;
  const dir = Math.sign(spec.angle) || 1;
  const L = spec.length;
  const p0 = BASE;
  const p1 = {
    x: BASE.x + Math.sin(rad) * L * 0.35,
    y: BASE.y - L * spec.rise * 1.25,
  };
  const p2 = {
    x: BASE.x + Math.sin(rad) * L * 0.55 + dir * L * 0.35 * Math.abs(Math.sin(rad)),
    y: BASE.y - L * spec.rise + L * spec.hang,
  };
  const at = (t: number) => ({
    x: (1 - t) ** 2 * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x,
    y: (1 - t) ** 2 * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y,
  });
  const tangent = (t: number) => {
    const x = 2 * (1 - t) * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
    const y = 2 * (1 - t) * (p1.y - p0.y) + 2 * t * (p2.y - p1.y);
    const len = Math.hypot(x, y) || 1;
    return { x: x / len, y: y / len };
  };

  const leaflets: Leaflet[] = [];
  const pairs = Math.round(L / 1.55);
  for (let i = 0; i < pairs; i++) {
    const t = 0.1 + (i / Math.max(pairs - 1, 1)) * 0.86;
    const p = at(t);
    const tg = tangent(t);
    const profile = Math.min(1, 0.55 + 1.8 * t) * (1 - t ** 2.6);
    const len = L * 0.19 * profile + 0.6;
    for (const side of [1, -1]) {
      // 잎줄기에 수직인 방향을 끝쪽으로 조금 기울인다.
      const nx = -tg.y * side;
      const ny = tg.x * side;
      const ax = nx * 0.85 + tg.x * 0.5;
      const ay = ny * 0.85 + tg.y * 0.5;
      const alen = Math.hypot(ax, ay) || 1;
      const ux = ax / alen;
      const uy = ay / alen;
      leaflets.push({
        cx: p.x + ux * len * 0.5,
        cy: p.y + uy * len * 0.5,
        rx: len * 0.55,
        ry: Math.max(len * 0.24, 0.55),
        rotate: (Math.atan2(uy, ux) * 180) / Math.PI,
        // 화면 위쪽을 향한 소엽이 빛을 받는다.
        light: uy < 0,
      });
    }
  }
  return {
    rachis: `M${p0.x} ${p0.y} Q${p1.x.toFixed(2)} ${p1.y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
    leaflets,
    end: p2,
  };
}

function Frond({ shape, color }: { shape: FrondShape; color: string }) {
  return (
    <g>
      {shape.leaflets
        .filter((l) => !l.light)
        .map((l) => (
          <ellipse
            key={`d${l.cx.toFixed(2)},${l.cy.toFixed(2)}`}
            cx={l.cx}
            cy={l.cy}
            rx={l.rx}
            ry={l.ry}
            fill={FROND_DARK}
            transform={`rotate(${l.rotate.toFixed(1)} ${l.cx.toFixed(2)} ${l.cy.toFixed(2)})`}
          />
        ))}
      <path d={shape.rachis} stroke={RACHIS} strokeWidth="0.9" fill="none" strokeLinecap="round" />
      {shape.leaflets
        .filter((l) => l.light)
        .map((l) => (
          <ellipse
            key={`l${l.cx.toFixed(2)},${l.cy.toFixed(2)}`}
            cx={l.cx}
            cy={l.cy}
            rx={l.rx}
            ry={l.ry}
            fill={color}
            transform={`rotate(${l.rotate.toFixed(1)} ${l.cx.toFixed(2)} ${l.cy.toFixed(2)})`}
          />
        ))}
      <circle cx={shape.end.x} cy={shape.end.y} r="0.9" fill={FROND_TIP} />
    </g>
  );
}

/** 동그랗게 말린 새순: 줄기가 올라가 끝이 오른쪽으로 말려 들어간다. */
function Fiddlehead({ x, top, coil }: { x: number; top: number; coil: number }) {
  const cx = x + coil;
  const total = Math.PI * 2.05;
  const points: string[] = [
    `M${x} ${BASE.y + 0.5}`,
    `Q${x - 0.6} ${(BASE.y + top) / 2} ${x} ${top}`,
  ];
  for (let i = 1; i <= 16; i++) {
    const phi = (i / 16) * total;
    const r = coil * (1 - (phi / total) * 0.72);
    const angle = Math.PI - phi;
    points.push(
      `L${(cx + r * Math.cos(angle)).toFixed(2)} ${(top - r * Math.sin(angle)).toFixed(2)}`
    );
  }
  const d = points.join(" ");
  return (
    <g>
      <path
        d={d}
        stroke={FIDDLEHEAD}
        strokeWidth={coil * 0.55}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={cx - coil * 0.55} cy={top - coil * 0.55} r={coil * 0.2} fill={FIDDLEHEAD_LIGHT} />
    </g>
  );
}

const STAGE_FRONDS: Record<Exclude<PlantStage, "seed" | "sprout">, FrondSpec[]> = {
  sapling: [
    { angle: -48, length: 18, rise: 0.7, hang: 0.18, layer: "back" },
    { angle: 44, length: 18, rise: 0.72, hang: 0.18, layer: "back" },
    { angle: -16, length: 19, rise: 0.92, hang: 0.06, layer: "back" },
    { angle: 18, length: 17, rise: 0.9, hang: 0.06, layer: "back" },
  ],
  tree: [
    { angle: -62, length: 24, rise: 0.55, hang: 0.3, layer: "front" },
    { angle: 64, length: 24, rise: 0.55, hang: 0.3, layer: "front" },
    { angle: -34, length: 25, rise: 0.8, hang: 0.15, layer: "back" },
    { angle: 36, length: 25, rise: 0.8, hang: 0.15, layer: "back" },
    { angle: -12, length: 24, rise: 0.95, hang: 0.05, layer: "back" },
    { angle: 14, length: 22, rise: 0.95, hang: 0.05, layer: "back" },
  ],
  bloom: [
    { angle: -74, length: 30, rise: 0.38, hang: 0.62, layer: "front" },
    { angle: 76, length: 30, rise: 0.38, hang: 0.62, layer: "front" },
    { angle: -58, length: 28, rise: 0.55, hang: 0.4, layer: "front" },
    { angle: 60, length: 28, rise: 0.55, hang: 0.4, layer: "front" },
    { angle: -38, length: 27, rise: 0.78, hang: 0.2, layer: "back" },
    { angle: 40, length: 27, rise: 0.78, hang: 0.2, layer: "back" },
    { angle: -18, length: 25, rise: 0.95, hang: 0.08, layer: "back" },
    { angle: 20, length: 25, rise: 0.95, hang: 0.08, layer: "back" },
    { angle: 2, length: 22, rise: 1, hang: 0.02, layer: "back" },
  ],
};

const shapeCache = new Map<string, FrondShape[]>();
function frondShapes(stage: keyof typeof STAGE_FRONDS, layer: FrondSpec["layer"]): FrondShape[] {
  const key = `${stage}:${layer}`;
  const hit = shapeCache.get(key);
  if (hit) return hit;
  const shapes = STAGE_FRONDS[stage].filter((s) => s.layer === layer).map(frondShape);
  shapeCache.set(key, shapes);
  return shapes;
}

export function FernArt({
  stage,
  layer,
  ripe = false,
}: {
  stage: PlantStage;
  layer: "back" | "front";
  /** 열매가 열림 (꽃·열매 단계). */
  ripe?: boolean;
}) {
  if (stage === "seed") {
    if (layer === "front") return null;
    // 나무 씨앗(`plant-avatar.tsx`)과 같은 모양·자리.
    return (
      <>
        <ellipse cx="32" cy="42.5" rx="8" ry="6" fill={SEED} transform="rotate(-25 32 42.5)" />
        <ellipse cx="29" cy="40" rx="2.2" ry="1.4" fill={SEED_HIGHLIGHT} />
      </>
    );
  }
  if (stage === "sprout") {
    if (layer === "front") return null;
    return (
      <>
        <Fiddlehead x={30} top={33} coil={4.2} />
        <Fiddlehead x={35.5} top={38.5} coil={3} />
      </>
    );
  }
  const shapes = frondShapes(stage, layer);
  const colors = [FROND_LIGHT, FROND];
  return (
    <>
      {shapes.map((shape, i) => (
        <Frond key={shape.rachis} shape={shape} color={colors[i % 2] ?? FROND} />
      ))}
      {layer === "back" && stage === "sapling" && <Fiddlehead x={31} top={33} coil={3.2} />}
      {layer === "front" && stage === "bloom" && (
        <>
          {/* 나무 아바타와 같은 꽃·열매: 꽃은 아치 위에, 열매는 늘어진 잎줄기 아래에. */}
          <Flower x={21} y={22} />
          <Flower x={43} y={21} />
          <Flower x={32} y={14} />
          {ripe && (
            <>
              <Fruit x={15} y={39} />
              <Fruit x={49} y={39} />
            </>
          )}
        </>
      )}
    </>
  );
}
