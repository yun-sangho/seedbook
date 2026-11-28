import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Seedbook 네이티브 앱. 앱 화면(Vite 빌드 `dist/`)을 바이너리에 담아 앱 origin
 * (iOS `capacitor://localhost`, Android `https://localhost`) 에서 띄우고, API 는 운영 서버를 부른다
 * (`src/lib/api-client.ts`, `src/lib/native/bundled-app.ts`). 서버가 멈춰 있거나 오프라인이어도 화면은
 * 뜨고, 기기에 저장된 로그인으로 계정을 연다 (`src/lib/offline-session.ts`).
 *
 * - 빌드: `pnpm --filter @seedbook/mobile sync` (= `vite build` + `cap sync`). 같은 `dist/` 를 운영 웹도 쓴다.
 * - dev live-reload: `CAP_SERVER_URL=http://localhost:4001 pnpm --filter @seedbook/mobile sync` 이면 앱이
 *   로컬 앱 dev 서버(Vite, 슬롯 web 포트)를 띄운다 — 다시 빌드하지 않고 화면을 고친다. 개발에서만 쓴다
 *   (`server.url` 은 운영용이 아니다, https://capacitorjs.com/docs/config).
 * - 개발용 앱 Seedbook Dev (`SEEDBOOK_DEV_APP=1`, 루트 `scripts/dev-app.mjs` 가 준다): 번들이 맥의 dev 서버를
 *   http 로 부르므로 Android 앱 origin(`https://localhost`)에서 http 요청(mixed content)을 허용한다. 번들 ID·이름·
 *   ATS/cleartext 예외는 네이티브 Dev 구성(iOS `Dev` 빌드 구성, Android `dev` 빌드 타입)에 있다.
 * - `appendUserAgent` 는 웹의 `NATIVE_APP_UA_MARKER` (src/lib/device.ts) 와 같아야 한다. 앱 화면은 이
 *   표시로 기기 저장소(SQLite)를 고르고 iPad 에서도 모바일 UI·PWA 설치 안내 숨김을 정한다.
 */
const liveReloadUrl = process.env.CAP_SERVER_URL;
const devApp = process.env.SEEDBOOK_DEV_APP === "1";

const config: CapacitorConfig = {
  appId: "ing.boogie.seedbook",
  appName: "Seedbook",
  webDir: "dist",
  appendUserAgent: "SeedbookApp/1",
  // backgroundColor 는 쓰지 않는다 — 고정색이라 다크 모드에서 흰색이 비친다 (iOS 상태바 뒤, 첫 로딩).
  // 배경은 네이티브가 시스템 테마에 맞춰 정한다 (SceneDelegate.swift, MainActivity.java).
  // 카카오·Apple 로그인은 네이티브 SDK 로 하므로 (src/lib/native/social-login.ts) 앱 안에서 열 외부
  // 도메인이 없다 — 그 밖의 주소는 시스템 브라우저로 열린다. live-reload 에서는 dev 서버가 웹 OAuth 를
  // 쓸 수 있게 로그인 화면을 앱 안에서 연다.
  ...(liveReloadUrl
    ? {
        server: {
          url: liveReloadUrl,
          cleartext: liveReloadUrl.startsWith("http://"),
          allowNavigation: ["*.kakao.com", "appleid.apple.com"],
        },
      }
    : {}),
  ...(devApp ? { android: { allowMixedContent: true } } : {}),
  plugins: {
    // Android 뒤로가기는 웹이 리스너를 건 뒤에 켠다 (src/lib/native/system-back.ts).
    App: { disableBackButtonHandler: true },
  },
};

export default config;
