import type { AppConfig } from "@seedbook/domain/app-version";

/**
 * 네이티브 앱 버전 정책 (`GET /api/app-config`). 앱은 시작·복귀 때 이 값을 보고, 자기 버전이
 * `minSupportedVersion` 보다 낮으면 업데이트 화면으로 막는다 (`apps/mobile/src/components/update-gate.tsx`).
 *
 * - 올리는 때: API·서버가 옛 앱을 더 받아 줄 수 없을 때 (API 는 추가만 하는 것이 원칙이라 드물다).
 *   먼저 새 버전을 스토어에 내고, 사용자가 받을 수 있게 된 뒤 이 값을 올려 배포한다.
 * - `latestVersion` 은 스토어에 나온 가장 새 버전 — 출시할 때 같이 올린다.
 * - 동기화 스키마 버전(`MIN_SCHEMA`)과 별개다. 그쪽은 동기화만 멈추고 기기 저장은 계속된다.
 */
export const APP_CONFIG: AppConfig = {
  minSupportedVersion: "1.0.0",
  latestVersion: "1.0.0",
};
