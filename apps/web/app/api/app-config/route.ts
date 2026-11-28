import { APP_CONFIG } from "@web/lib/app-config";

// 빌드 때 정적 파일로 굳히지 않는다 — 응답 헤더(no-store)를 그대로 보낸다.
export const dynamic = "force-dynamic";

/** 네이티브 앱 버전 정책 (`lib/app-config.ts`). 로그인 전에도 부른다 — 인증이 필요 없다. */
export function GET() {
  return Response.json(APP_CONFIG, { headers: { "cache-control": "no-store" } });
}
