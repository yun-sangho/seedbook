/**
 * 번들 앱이 부르는 운영 API 서버 (`lib/native/bundled-app.ts`). 빌드 값 `SEEDBOOK_API_BASE_URL` 이 있으면
 * 그쪽이 이긴다 (`lib/api-client.ts`). vite.config.ts 도 읽으므로 (CSP connect-src) 다른 모듈을 import 하지 않는다.
 */
export const BUNDLED_APP_API_BASE_URL = "https://seedbook.boogie.ing";
