"use client";

import { useLayoutEffect } from "react";

/**
 * SEED 색상 모드 속성을 <html> 에 건다. SEED CSS 는 `data-seed-color-mode` /
 * `data-seed-user-color-scheme` 조합으로 라이트/다크 토큰을 고른다.
 *
 * 첫 SSR 페인트는 인라인 스크립트가, 클라이언트 내비게이션으로 모바일 트리에
 * 들어온 경우는 layout effect 가 처리한다. 모바일 트리를 벗어나면 속성을 걷어
 * 데스크탑(next-themes) 쪽에 영향을 주지 않는다.
 */
const INLINE_SCRIPT = `(function(){try{var d=document.documentElement;var m=window.matchMedia("(prefers-color-scheme: dark)");d.setAttribute("data-seed-color-mode","system");d.setAttribute("data-seed-user-color-scheme",m.matches?"dark":"light");}catch(e){}})();`;

export function SeedColorScheme() {
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

  // biome-ignore lint/security/noDangerouslySetInnerHtml: 첫 페인트 전에 색 모드를 정하는 고정 인라인 스크립트 (사용자 입력 없음).
  return <script dangerouslySetInnerHTML={{ __html: INLINE_SCRIPT }} />;
}
