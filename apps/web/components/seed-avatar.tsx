import { useId } from "react";
import {
  SEED_AVATAR_COLORS,
  type SeedAvatarForm,
  type SeedAvatarLeafCount,
  type SeedAvatarVariant,
} from "@web/lib/seed-identity/seed-avatar";

/** 잎 하나 (원점에서 위로 자란다). */
const LEAF_PATH = "M0 0 C-7.5 -4 -7.5 -12.5 0 -18 C7.5 -12.5 7.5 -4 0 0Z";

const LEAF_ANGLES: Record<SeedAvatarLeafCount, readonly number[]> = {
  1: [22],
  2: [-50, 50],
  3: [-60, 0, 60],
};

const LEAF_SCALE: Record<SeedAvatarLeafCount, number> = { 1: 1.1, 2: 1, 3: 0.88 };

/** 잎이 붙는 자리. */
const LEAF_ANCHORS: Record<SeedAvatarForm, [number, number]> = {
  seed: [32, 35],
  sprout: [32, 31],
  pot: [32, 29],
};

const SEED_BROWN = "#A26F40";
const SEED_HIGHLIGHT = "#C38E5C";
const SOIL = "#8A5D3B";
const POT = "#C9714A";
const POT_RIM = "#B35F3A";
/** 씨앗 아바타 SVG (`lib/seed-identity/seed-avatar.ts`). 배경 원까지 그려 색 모드와 무관하다. */
export function SeedAvatar({
  variant,
  size,
  className,
}: {
  variant: SeedAvatarVariant;
  size: number;
  className?: string;
}) {
  const clipId = useId();
  const color = SEED_AVATAR_COLORS[variant.color];
  const leaf = LEAF_ANCHORS[variant.form];
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      aria-hidden
      focusable="false"
    >
      <defs>
        <clipPath id={clipId}>
          <circle cx="32" cy="32" r="32" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width="64" height="64" fill={color.bg} />
        {variant.form !== "seed" && (
          <line
            x1={leaf[0]}
            y1={leaf[1]}
            x2={leaf[0]}
            y2={variant.form === "sprout" ? 46 : 41}
            stroke={color.leaf}
            strokeWidth="3"
            strokeLinecap="round"
          />
        )}
        {LEAF_ANGLES[variant.leaves].map((angle) => (
          <g
            key={angle}
            transform={`translate(${leaf[0]} ${leaf[1]}) rotate(${angle}) scale(${LEAF_SCALE[variant.leaves]})`}
          >
            <path d={LEAF_PATH} fill={color.leaf} />
            <path d="M0 -2.5 L0 -13" stroke={color.vein} strokeWidth="1.6" strokeLinecap="round" />
          </g>
        ))}
        {variant.form === "seed" && (
          <>
            <ellipse cx="32" cy="44.5" rx="12.5" ry="10.5" fill={SEED_BROWN} />
            <ellipse
              cx="26.5"
              cy="40.5"
              rx="3.2"
              ry="2.2"
              fill={SEED_HIGHLIGHT}
              transform="rotate(-30 26.5 40.5)"
            />
          </>
        )}
        {variant.form === "sprout" && <path d="M-2 64 V54 Q32 36 66 54 V64Z" fill={SOIL} />}
        {variant.form === "pot" && (
          <>
            <path d="M22.5 43 H41.5 L38.5 57 H25.5Z" fill={POT} />
            <rect x="20" y="39" width="24" height="5.5" rx="2" fill={POT_RIM} />
          </>
        )}
      </g>
    </svg>
  );
}
