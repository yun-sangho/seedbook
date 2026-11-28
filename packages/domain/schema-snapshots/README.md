# 레코드 정의 스냅샷

출시한 버전마다 레코드 정의를 `v<SCHEMA_VERSION>.json` 으로 남긴다 (`pnpm --filter @seedbook/domain schema:snapshot`).
`pnpm schema:check` 가 지금 정의를 이 스냅샷들과 비교해 확장/깨는 변경을 가른다.

- 스냅샷은 고치거나 지우지 않는다. 옛 앱이 그 모양으로 서버와 동기화한다.
- 아직 출시한 앱이 없어 비어 있다. 첫 번들 앱 출시 때 `v1.json` 을 만든다.
