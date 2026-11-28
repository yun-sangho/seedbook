/**
 * PWA 서비스 워커 등록. 서비스 워커는 웹 서버가 만든다 (`apps/web/app/sw.ts` → `/sw.js`, 정책도 거기).
 * 옛 Next 루트 레이아웃의 `SerwistProvider` 와 같이 운영 빌드에서만, 페이지 로드가 끝난 뒤 등록한다
 * (dev 에는 sw.js 가 없다).
 */
export function registerServiceWorker(): void {
  if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
  const register = () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // 등록 실패는 앱 동작에 영향이 없다 (온라인 전용 앱, 정적 자산 캐시만 잃는다).
    });
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
