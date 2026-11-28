/**
 * 데이터 모양 버전 (설계 §7.6).
 * - `SCHEMA_VERSION`: 레코드 정의가 바뀌면 (확장 포함) 직전 출시 스냅샷보다 크게 올린다.
 * - `MIN_SCHEMA`: 서버가 받는 가장 옛 버전. 깨는 변경 때만 올린다 — 그 아래 앱은 동기화가 멈춘다.
 *
 * `pnpm schema:check` 가 출시 스냅샷(`schema-snapshots/v<N>.json`)과 비교해 이 규칙을 확인한다.
 * 출시한 앱이 아직 없어 스냅샷이 없다 — 첫 번들 앱 출시 때 `pnpm schema:snapshot` 으로 v1 을 만든다.
 */
export const SCHEMA_VERSION = 1;
export const MIN_SCHEMA = 1;
