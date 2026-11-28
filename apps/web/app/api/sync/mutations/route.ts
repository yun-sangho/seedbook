import { v1Retired } from "@web/server/sync/v1-retired";

/** 동기화 v1 쓰기 — 지웠다. 옛 클라이언트에 426 (`server/sync/v1-retired.ts`). v2 는 `/api/sync/v2/push`. */
export const POST = v1Retired;
