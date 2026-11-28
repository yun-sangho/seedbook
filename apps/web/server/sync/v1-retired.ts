import { MIN_SCHEMA, SYNC_PROTOCOL } from "@seedbook/domain";

/**
 * 지운 동기화 v1 엔드포인트(`/api/sync/mutations`·`/api/sync/pull`·`/api/storage/[key]`)의 응답.
 *
 * 404 대신 **426 Upgrade Required** 로 답한다. 옛 JS 를 캐시한 브라우저·PWA 의 v1 엔진은 응답이
 * `ok` 가 아니면 오류로 표시하고 대기열을 그대로 둔 채 나중에 다시 시도한다 — 404 도 같지만, 426 은
 * "앱을 새로 받아야 한다"는 뜻이 응답·로그에 드러나고 v2 의 버전 게이트(`schema_too_old`)와 같은 신호다.
 * 쓰기는 하지 않으므로 옛 클라이언트가 서버 데이터를 바꾸지 못한다 (v1 은 하위 목록을 통째로 바꿔
 * v2 기기의 편집을 덮을 수 있었다).
 */
export function v1Retired(request: Request): Response {
  console.warn(
    JSON.stringify({
      event: "sync_v1_retired",
      method: request.method,
      path: new URL(request.url).pathname,
    })
  );
  return Response.json(
    {
      error: "upgrade_required",
      code: "sync_v1_retired",
      protocol: SYNC_PROTOCOL,
      minSchema: MIN_SCHEMA,
    },
    { status: 426 }
  );
}
