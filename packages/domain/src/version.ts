/**
 * 데이터 모양 버전 (설계 §7.6).
 * - `SCHEMA_VERSION`: 레코드 정의가 바뀌면 (확장 포함) 직전 출시 스냅샷보다 크게 올린다.
 * - `MIN_SCHEMA`: 서버가 받는 가장 옛 버전. 깨는 변경 때만 올린다 — 그 아래 앱은 동기화가 멈춘다.
 *
 * `pnpm schema:check` 가 출시 스냅샷(`schema-snapshots/v<N>.json`)과 비교해 이 규칙을 확인한다.
 * 첫 스냅샷 `v1` 은 동기화 v2-5 (v2 클라이언트가 모바일 웹으로 배포된 뒤) 에 커밋했다. 출시할 때마다
 * `pnpm --filter @seedbook/domain schema:snapshot` 으로 새 스냅샷을 남긴다.
 */
export const SCHEMA_VERSION = 2;
export const MIN_SCHEMA = 1;
