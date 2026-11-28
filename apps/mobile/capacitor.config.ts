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
 * - `appendUserAgent` 는 웹의 `NATIVE_APP_UA_MARKER` (src/lib/device.ts) 와 같아야 한다. 앱 화면은 이
 *   표시로 기기 저장소(SQLite)를 고르고 iPad 에서도 모바일 UI·PWA 설치 안내 숨김을 정한다.
 */
const liveReloadUrl = process.env.CAP_SERVER_URL;

/**
 * OTA 번들 업데이트 (`@capawesome/capacitor-live-update`, `src/lib/native/live-update.ts`). 번들 서명을
 * 확인할 RSA 공개 키(PEM)는 빌드 env `SEEDBOOK_OTA_PUBLIC_KEY` (GitHub Variable `APP_BUNDLE_PUBLIC_KEY`,
 * `mobile-release.yml`) 로 넣는다. 키가 없는 빌드는 채널을 두지 않아 OTA 를 쓰지 않는다 — 서명 확인 없이
 * 번들을 받는 바이너리를 만들지 않는다. 기본 채널은 `SEEDBOOK_OTA_CHANNEL` (Dev 앱·내부 테스트는 `beta`).
 */
const otaPublicKey = process.env.SEEDBOOK_OTA_PUBLIC_KEY?.trim();
const otaChannel = process.env.SEEDBOOK_OTA_CHANNEL === "beta" ? "beta" : "production";
/** 새 번들이 `ready()` 를 부르기까지 기다리는 시간. 못 부르면 내장 번들로 되돌린다. */
const OTA_READY_TIMEOUT_MS = 15_000;

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
  plugins: {
    // Android 뒤로가기는 웹이 리스너를 건 뒤에 켠다 (src/lib/native/system-back.ts).
    App: { disableBackButtonHandler: true },
    LiveUpdate: otaPublicKey
      ? {
          publicKey: otaPublicKey,
          defaultChannel: otaChannel,
          readyTimeout: OTA_READY_TIMEOUT_MS,
          // ready() 뒤에 쓰지 않는 번들(지난 번들)을 지운다.
          autoDeleteBundles: true,
          autoUpdateStrategy: "none",
        }
      : { readyTimeout: 0, autoUpdateStrategy: "none" },
  },
};

export default config;
