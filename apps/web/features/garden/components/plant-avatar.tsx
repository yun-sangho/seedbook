import { useId } from "react";
import { type PlantStage, POT_COLORS, type PotColor } from "../plant-3d/plant-options";

/**
 * 식물 2D 아바타 (SVG). 3D 식물과 같은 색·모양 규칙(화분, 씨앗 아바타 잎 모양)으로 단계별로 그린다.
 * 3D 의 툰 셰이딩처럼 면마다 그늘·중간·밝은 면 세 단계로 칠한다.
 * 씨앗 아바타(`components/seed-avatar.tsx`)와 같은 64×64 원형.
 */

const LEAF_PATH = "M0 0 C-7.5 -4 -7.5 -12.5 0 -18 C7.5 -12.5 7.5 -4 0 0Z";
/** 원형 배경. 다크 모드에서는 `--plant-avatar-bg` (globals.css) 가 정원 밤하늘에 맞춘 색으로 바꾼다. */
const BG = "var(--plant-avatar-bg, #E2F4DF)";
const LEAF = "#3E9F4C";
const LEAF_LIGHT = "#5DB565";
const LEAF_DARK = "#2F8A40";
const VEIN = "#B9E3B5";
const STEM = "#4E9A48";
const TRUNK = "#8B5E3C";
const SOIL = "#5E3F2A";
const SEED = "#F0C070";
const SEED_HIGHLIGHT = "#FFE3B0";
const PETAL = "#F8B3CB";
const PETAL_CENTER = "#FFD66B";
const FRUIT = "#E8664F";

/** 색을 검정(음수)·흰색(양수) 쪽으로 섞는다. 툰 그늘·밝은 면용. */
function shade(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const target = amount < 0 ? 0 : 255;
  const t = Math.abs(amount);
  const mix = (c: number) => Math.round(c + (target - c) * t);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/** 툰 덩어리: 아래 오른쪽 그늘 + 중간 면 + 왼쪽 위 밝은 점. */
function ToonBlob({ cx, cy, r, color }: { cx: number; cy: number; r: number; color: string }) {
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill={shade(color, -0.22)} />
      <circle cx={cx - r * 0.12} cy={cy - r * 0.14} r={r * 0.86} fill={color} />
      <ellipse
        cx={cx - r * 0.4}
        cy={cy - r * 0.42}
        rx={r * 0.3}
        ry={r * 0.2}
        fill={shade(color, 0.35)}
        transform={`rotate(-30 ${cx - r * 0.4} ${cy - r * 0.42})`}
      />
    </>
  );
}

function Leaf({
  x,
  y,
  angle,
  scale,
  color = LEAF,
}: {
  x: number;
  y: number;
  angle: number;
  scale: number;
  color?: string;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle}) scale(${scale})`}>
      <path d={LEAF_PATH} fill={color} />
      {/* 잎맥 오른쪽 반은 그늘 (접힌 잎) */}
      <path d="M0 0 C7.5 -4 7.5 -12.5 0 -18Z" fill={shade(color, -0.18)} />
      <path d="M0 -2.5 L0 -13" stroke={VEIN} strokeWidth="1.6" strokeLinecap="round" />
    </g>
  );
}

function Pot({ pot }: { pot: PotColor }) {
  const colors = POT_COLORS[pot];
  return (
    <>
      <path d="M22 50 H42 L39.5 66 H24.5Z" fill={colors.body} />
      <path d="M36 50 H42 L39.5 66 H34.5Z" fill={shade(colors.body, -0.15)} />
      <rect x="19.5" y="46" width="25" height="5.5" rx="2" fill={colors.rim} />
      <ellipse cx="32" cy="46.6" rx="10.5" ry="1.6" fill={SOIL} />
    </>
  );
}

function Flower({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {[0, 72, 144, 216, 288].map((a) => (
        <circle
          key={a}
          cx={Math.cos((a * Math.PI) / 180) * 1.7}
          cy={Math.sin((a * Math.PI) / 180) * 1.7}
          r="1.5"
          fill={PETAL}
        />
      ))}
      <circle r="1.1" fill={PETAL_CENTER} />
    </g>
  );
}

function StageArt({ stage }: { stage: PlantStage }) {
  switch (stage) {
    case "seed":
      return (
        <>
          <ellipse cx="32" cy="42.5" rx="8" ry="6" fill={SEED} transform="rotate(-25 32 42.5)" />
          <ellipse cx="29" cy="40" rx="2.2" ry="1.4" fill={SEED_HIGHLIGHT} />
        </>
      );
    case "sprout":
      return (
        <>
          <line
            x1="32"
            y1="46"
            x2="32"
            y2="34"
            stroke={STEM}
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <Leaf x={32} y={34} angle={-58} scale={0.75} />
          <Leaf x={32} y={34} angle={58} scale={0.75} color={LEAF_LIGHT} />
        </>
      );
    case "sapling":
      return (
        <>
          <path
            d="M32 46 Q31 34 33 18"
            stroke={STEM}
            strokeWidth="2.2"
            fill="none"
            strokeLinecap="round"
          />
          <Leaf x={31.6} y={38} angle={-68} scale={0.6} />
          <Leaf x={31.8} y={32} angle={64} scale={0.6} color={LEAF_LIGHT} />
          <Leaf x={32.3} y={26} angle={-60} scale={0.55} color={LEAF_LIGHT} />
          <Leaf x={32.7} y={21} angle={55} scale={0.5} />
          <Leaf x={33} y={18} angle={8} scale={0.45} color={LEAF_LIGHT} />
        </>
      );
    case "tree":
    case "bloom":
      return (
        <>
          <path d="M30 46.5 L31 30 H33 L34 46.5Z" fill={TRUNK} />
          <path d="M32 36 L24 29" stroke={TRUNK} strokeWidth="1.8" strokeLinecap="round" />
          <path d="M32 33 L40 27" stroke={TRUNK} strokeWidth="1.8" strokeLinecap="round" />
          <ToonBlob cx={23} cy={27} r={7} color={LEAF_LIGHT} />
          <ToonBlob cx={41} cy={25} r={7} color={LEAF_DARK} />
          <ToonBlob cx={32} cy={22} r={10.5} color={LEAF} />
          <ToonBlob cx={33.5} cy={13.5} r={6} color={LEAF_LIGHT} />
          {stage === "bloom" && (
            <>
              <Flower x={27} y={18} />
              <Flower x={37} y={15} />
              <Flower x={20} y={26} />
              <Flower x={43} y={23} />
              <circle cx="25" cy="33.5" r="2.4" fill={FRUIT} />
              <circle cx="40" cy="31.5" r="2.4" fill={FRUIT} />
            </>
          )}
        </>
      );
  }
}

export function PlantAvatar({
  stage,
  pot = "terracotta",
  size,
}: {
  stage: PlantStage;
  pot?: PotColor;
  size: number;
}) {
  const clipId = useId();
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden focusable="false">
      <defs>
        <clipPath id={clipId}>
          <circle cx="32" cy="32" r="32" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width="64" height="64" fill={BG} />
        <StageArt stage={stage} />
        <Pot pot={pot} />
      </g>
    </svg>
  );
}
