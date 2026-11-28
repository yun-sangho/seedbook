/** 원본(0 0 100 100)에서 여백을 줄여 그림(x 29~71, y 20~81)에 맞춘 상자 — size 가 그림 크기에 가깝다. */
const TIGHT_VIEW_BOX = "15 15 70 70";

/**
 * Seedbook 마크 (씨앗에서 싹). 원본은 apps/web/brand/mark.svg — 앱 아이콘·스플래시와 같은 그림이라 스플래시에서
 * 로그인 화면으로 넘어가도 같은 마크가 남는다. 원본과 같은지는 `brand-mark.test.tsx` 가 본다.
 */
export function BrandMark({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={TIGHT_VIEW_BOX}
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <g transform="translate(0 -5)">
        <g transform="rotate(-18 50 68)">
          <ellipse cx="50" cy="68" rx="21" ry="15.5" fill="#CCA35F" />
          <ellipse cx="48" cy="66" rx="19" ry="13.5" fill="#F0C070" />
          <ellipse cx="41" cy="61" rx="6" ry="3.4" fill="#FFE3B0" />
        </g>
        <path
          d="M50 56 Q49 48 50 42"
          stroke="#4E9A48"
          strokeWidth="5"
          fill="none"
          strokeLinecap="round"
        />
        <g transform="translate(50 43) rotate(-54) scale(1.45)">
          <path d="M0 0 C-7.5 -4 -7.5 -12.5 0 -18 C7.5 -12.5 7.5 -4 0 0Z" fill="#3E9F4C" />
          <path d="M0 0 C7.5 -4 7.5 -12.5 0 -18Z" fill="#33823E" />
          <path d="M0 -2.5 L0 -13" stroke="#B9E3B5" strokeWidth="1.6" strokeLinecap="round" />
        </g>
        <g transform="translate(50 43) rotate(54) scale(1.45)">
          <path d="M0 0 C-7.5 -4 -7.5 -12.5 0 -18 C7.5 -12.5 7.5 -4 0 0Z" fill="#5DB565" />
          <path d="M0 0 C7.5 -4 7.5 -12.5 0 -18Z" fill="#4C9453" />
          <path d="M0 -2.5 L0 -13" stroke="#B9E3B5" strokeWidth="1.6" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  );
}
