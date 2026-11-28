/**
 * 기기 레코드의 `writtenBy` — 그 행을 쓴 앱 번들 (설계 §5.7.1). 잘못된 번들이 쓴 행을 나중에
 * 찾아 고칠 수 있게 한다. 앱 번들 빌드(vite.config.ts)가 `SEEDBOOK_APP_BUILD` 에 커밋 sha 를 넣는다
 * (`apps/web/Dockerfile` → vite.config.ts). 로컬 개발·테스트는 `dev`.
 */
export const APP_BUILD = `web@${process.env.SEEDBOOK_APP_BUILD || "dev"}`;
