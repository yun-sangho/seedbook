# 레코드 정의 스냅샷

출시한 버전마다 레코드 정의를 `v<SCHEMA_VERSION>.json` 으로 남긴다 (`pnpm --filter @seedbook/domain schema:snapshot`).
`pnpm schema:check` 가 지금 정의를 이 스냅샷들과 비교해 확장/깨는 변경을 가른다.

- 스냅샷은 고치거나 지우지 않는다. 옛 앱이 그 모양으로 서버와 동기화한다.
- `v1.json` 은 동기화 v2 클라이언트(모바일 웹)가 운영에 나간 뒤 동기화 v2-5 에서 만든 첫 스냅샷이다.
- `apps/web/server/sync/v2/old-app-replay.db.test.ts` 가 지원 구간 `[MIN_SCHEMA, SCHEMA_VERSION]` 의 스냅샷마다 옛 앱 재생을 돌린다.
