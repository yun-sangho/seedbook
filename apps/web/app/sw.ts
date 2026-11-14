/// <reference lib="webworker" />
import { NetworkOnly, type PrecacheEntry, Serwist, type SerwistGlobalConfig } from "serwist";

/**
 * Seedbook 서비스 워커 (`@serwist/next` 가 prod 빌드 시 public/sw.js 로 번들).
 *
 * 정책: 앱은 온라인 전용이다. 빌드 정적 자산(`_next/static`) 만 precache 해
 * 실행 속도를 높이고, 페이지·API 응답은 캐시하지 않는다. 네비게이션이 네트워크
 * 실패로 끝나면 precache 해 둔 `/offline` 안내 페이지를 보여준다.
 *
 * 페이지를 캐시하지 않는 또 다른 이유: proxy 가 UA 에 따라 같은 URL 에
 * 데스크탑/모바일(`/m`) 서로 다른 HTML 을 내려주므로, URL 키 캐시는 보기 전환
 * 쿠키를 바꿨을 때 엉뚱한 트리를 돌려줄 수 있다.
 */

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const OFFLINE_FALLBACK_URL = "/offline";

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // 새 SW 는 열린 탭이 모두 닫힌 뒤(앱 재실행) 활성화된다. 실행 중인 페이지가
  // 지워진 옛 청크를 lazy-load 하다 깨지는 상황을 피하기 위함.
  skipWaiting: false,
  clientsClaim: false,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: ({ request }) => request.mode === "navigate",
      handler: new NetworkOnly(),
    },
  ],
  fallbacks: {
    entries: [
      {
        url: OFFLINE_FALLBACK_URL,
        matcher: ({ request }) => request.mode === "navigate",
      },
    ],
  },
});

serwist.addEventListeners();
