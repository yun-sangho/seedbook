import { v1Retired } from "@web/server/sync/v1-retired";

/**
 * 자산 store envelope 저장(v1) — 지웠다. 옛 클라이언트에 426 (`server/sync/v1-retired.ts`).
 * 자산은 동기화 v2 (`/api/sync/v2/*`) 로만 주고받는다.
 */
export const GET = v1Retired;
export const PUT = v1Retired;
