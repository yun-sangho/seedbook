// 첫 페인트 전에 SEED 색상 모드 속성을 건다 (index.html 이 모듈보다 먼저 불러온다). 그 뒤 시스템 색 모드
// 변경은 앱의 useSeedColorScheme (src/components/mobile/seed-color-scheme.tsx, 같은 내용) 이 따라간다.
// CSP 가 인라인 스크립트를 막으므로 파일로 둔다.
(() => {
  try {
    const root = document.documentElement;
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.setAttribute("data-seed-color-mode", "system");
    root.setAttribute("data-seed-user-color-scheme", dark ? "dark" : "light");
  } catch {}
})();
