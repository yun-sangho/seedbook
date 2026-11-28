"use client";

import { useLayoutEffect } from "react";

/**
 * SEED 색상 모드 속성을 <html> 에 건다. SEED CSS 는 `data-seed-color-mode` /
 * `data-seed-user-color-scheme` 조합으로 라이트/다크 토큰을 고른다.
 *
 * 첫 SSR 페인트는 인라인 스크립트가, 그 뒤(색 모드 변경)는 layout effect 가 처리한다. 화면을
 * 벗어나면 속성을 걷어 next-themes 쪽에 영향을 주지 않는다.
 */
const INLINE_SCRIPT = `(function(){try{var d=document.documentElement;var m=window.matchMedia("(prefers-color-scheme: dark)");d.setAttribute("data-seed-color-mode","system");d.setAttribute("data-seed-user-color-scheme",m.matches?"dark":"light");}catch(e){}})();`;

/**
 * 시스템 색 모드를 따라 SEED 색상 모드 속성을 건다 (바뀌면 다시). 앱(SPA)은 첫 페인트를
 * `public/_app/seed-color-scheme.js` (index.html 이 먼저 불러오는 같은 내용의 스크립트) 가 맡고
 * 이 훅만 쓴다.
 */
export function useSeedColorScheme() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      root.setAttribute("data-seed-color-mode", "system");
      root.setAttribute("data-seed-user-color-scheme", media.matches ? "dark" : "light");
    };
    apply();
    media.addEventListener("change", apply);
    return () => {
      media.removeEventListener("change", apply);
      root.removeAttribute("data-seed-color-mode");
      root.removeAttribute("data-seed-user-color-scheme");
    };
  }, []);
}

/** 서버가 그리는 페이지(소개 사이트)용. `nonce`: CSP nonce (`lib/csp.ts`). 없으면 인라인 스크립트가 막힌다. */
export function SeedColorScheme({ nonce }: { nonce?: string }) {
  useSeedColorScheme();

  // 브라우저는 nonce 속성 값을 DOM 에서 숨긴다 (nonce hiding) — 하이드레이션 불일치 경고를 끈다.
  return (
    <script
      nonce={nonce}
      suppressHydrationWarning
      // biome-ignore lint/security/noDangerouslySetInnerHtml: 첫 페인트 전에 색 모드를 정하는 고정 인라인 스크립트 (사용자 입력 없음).
      dangerouslySetInnerHTML={{ __html: INLINE_SCRIPT }}
    />
  );
}
