import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Seedbook 네이티브 앱 셸. 앱 안에 웹 번들을 담지 않고 운영 서버를 WebView 로 띄운다 —
 * 웹앱은 서버(로그인·API·proxy)가 있어야 동작하고, 웹 배포가 곧 앱 업데이트가 된다.
 *
 * - 서버 주소: 기본은 운영. 로컬 서버로 띄우려면 `CAP_SERVER_URL=http://<맥 LAN IP>:3001 pnpm sync`.
 * - `appendUserAgent` 는 웹의 `NATIVE_APP_UA_MARKER` (apps/web/lib/device.ts) 와 같아야 한다.
 *   웹은 이 표시를 보고 iPad 에서도 모바일 UI 를 주고 PWA 설치 안내를 숨긴다.
 * - 서버에 닿지 않으면 `www/error.html` (scripts/build-www.mjs 가 만든다) 을 보여준다.
 */
const DEFAULT_SERVER_URL = "https://seedbook.boogie.ing";
const serverUrl = process.env.CAP_SERVER_URL ?? DEFAULT_SERVER_URL;

const config: CapacitorConfig = {
  appId: "ing.boogie.seedbook",
  appName: "Seedbook",
  webDir: "www",
  appendUserAgent: "SeedbookApp/1",
  backgroundColor: "#ffffff",
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith("http://"),
    errorPath: "error.html",
    // 앱 안에서 열어야 하는 외부 화면 (로그인). 그 밖의 도메인은 시스템 브라우저로 연다.
    allowNavigation: ["*.kakao.com", "appleid.apple.com"],
  },
};

export default config;
