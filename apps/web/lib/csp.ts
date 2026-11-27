/**
 * Content-Security-Policy. `proxy.ts` 가 요청마다 nonce 를 만들어 이 정책을 요청·응답 헤더에 건다.
 * Next.js 는 요청 헤더의 정책에서 nonce 를 읽어 자기 스크립트에 붙이고, 직접 그리는 인라인
 * 스크립트(next-themes, SEED 색 모드)는 `x-nonce` 헤더 값을 받아 붙인다.
 *
 * - script: nonce 가 있는 스크립트와 그 스크립트가 불러온 것만 (`strict-dynamic`). 네이티브 앱의
 *   Capacitor 브리지는 페이지 밖에서 주입되므로 (iOS WKUserScript, Android addDocumentStartJavaScript)
 *   정책의 영향을 받지 않는다.
 * - style: React·차트가 SSR HTML 에 `style="..."` 속성을 그려 `'unsafe-inline'` 이 필요하다. 여기에
 *   nonce 를 섞으면 `'unsafe-inline'` 이 무시되므로 넣지 않는다.
 * - 네트워크 요청은 같은 출처로만 (`/api/*`). 외부 시세 API 는 서버가 부른다.
 */

export const CSP_NONCE_HEADER = "x-nonce";

export function createCspNonce(): string {
  return btoa(crypto.randomUUID());
}

export function buildContentSecurityPolicy({
  nonce,
  isDev,
}: {
  nonce: string;
  isDev: boolean;
}): string {
  const directives: [string, ...string[]][] = [
    ["default-src", "'self'"],
    // 개발 모드의 React 는 서버 에러 스택을 eval 로 복원한다.
    [
      "script-src",
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    ["style-src", "'self'", "'unsafe-inline'"],
    ["img-src", "'self'", "blob:", "data:"],
    ["font-src", "'self'"],
    ["connect-src", "'self'"],
    ["worker-src", "'self'"],
    ["manifest-src", "'self'"],
    ["object-src", "'none'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
    ["frame-ancestors", "'none'"],
    // http dev 서버 (localhost, Android 에뮬레이터 10.0.2.2) 에서는 https 로 올리면 깨진다.
    ...(isDev ? [] : [["upgrade-insecure-requests"] as [string]]),
  ];
  return directives.map((directive) => directive.join(" ")).join("; ");
}
