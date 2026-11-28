/**
 * Content-Security-Policy. 웹 서버(`apps/web/proxy.ts`)가 요청마다 nonce 를 만들어 이 정책을 요청·응답 헤더에 건다.
 * Next.js 는 요청 헤더의 정책에서 nonce 를 읽어 자기 스크립트에 붙이고, 직접 그리는 인라인
 * 스크립트(next-themes, SEED 색 모드)는 `x-nonce` 헤더 값을 받아 붙인다.
 *
 * - script: nonce 가 있는 스크립트와 그 스크립트가 불러온 것만 (`strict-dynamic`). 네이티브 앱의
 *   Capacitor 브리지는 페이지 밖에서 주입되므로 (iOS WKUserScript, Android addDocumentStartJavaScript)
 *   정책의 영향을 받지 않는다.
 * - style: React·차트가 SSR HTML 에 `style="..."` 속성을 그려 `'unsafe-inline'` 이 필요하다. 여기에
 *   nonce 를 섞으면 `'unsafe-inline'` 이 무시되므로 넣지 않는다.
 * - 네트워크 요청은 같은 출처로만 (`/api/*`). 외부 시세 API 는 서버가 부른다.
 * - 앱 화면(SPA)은 nonce 없이 `buildAppContentSecurityPolicy` 를 쓴다.
 */

export const CSP_NONCE_HEADER = "x-nonce";

export function createCspNonce(): string {
  return btoa(crypto.randomUUID());
}

type Directive = [string, ...string[]];

function policyDirectives(
  scriptSources: string[],
  isDev: boolean,
  connectSources: string[] = []
): Directive[] {
  return [
    ["default-src", "'self'"],
    // 개발 모드의 React 는 서버 에러 스택을 eval 로 복원한다.
    ["script-src", "'self'", ...scriptSources, ...(isDev ? ["'unsafe-eval'"] : [])],
    ["style-src", "'self'", "'unsafe-inline'"],
    ["img-src", "'self'", "blob:", "data:"],
    ["font-src", "'self'"],
    ["connect-src", "'self'", ...connectSources],
    ["worker-src", "'self'"],
    ["manifest-src", "'self'"],
    ["object-src", "'none'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
    ["frame-ancestors", "'none'"],
    // http dev 서버 (localhost, Android 에뮬레이터 10.0.2.2) 에서는 https 로 올리면 깨진다.
    ...(isDev ? [] : [["upgrade-insecure-requests"] as Directive]),
  ];
}

function serialize(directives: Directive[]): string {
  return directives.map((directive) => directive.join(" ")).join("; ");
}

/** Next 가 서버에서 그리는 페이지(소개·약관). 요청마다 nonce 를 받는다. */
export function buildContentSecurityPolicy({
  nonce,
  isDev,
}: {
  nonce: string;
  isDev: boolean;
}): string {
  return serialize(policyDirectives([`'nonce-${nonce}'`, "'strict-dynamic'"], isDev));
}

/**
 * 앱 화면 (Vite SPA, `index.html`). 정적 파일이라 nonce 가 없고 인라인 스크립트도 두지 않는다 —
 * 스크립트는 같은 출처의 번들 파일만. 웹 서버는 응답 헤더로 (`meta: false`), 빌드는 `index.html` 의
 * `<meta http-equiv>` 로 (`meta: true`, 앱 번들은 헤더를 줄 서버가 없다) 같은 정책을 건다.
 * `frame-ancestors` 는 meta 에서 무시되므로 meta 형식에서는 뺀다.
 *
 * `apiOrigins`: 앱 번들이 부르는 API 서버 (앱 origin 은 `capacitor://localhost` 라 `'self'` 가 아니다,
 * `lib/native/bundled-app.ts`). 운영 웹에서는 API 가 같은 origin 이라 더해도 달라지지 않는다.
 */
export function buildAppContentSecurityPolicy({
  isDev,
  meta,
  apiOrigins = [],
}: {
  isDev: boolean;
  meta: boolean;
  apiOrigins?: string[];
}): string {
  const directives = policyDirectives([], isDev, apiOrigins);
  return serialize(meta ? directives.filter(([name]) => name !== "frame-ancestors") : directives);
}
