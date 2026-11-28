import { sign } from "node:crypto";

/**
 * Sign in with Apple 설정 (서버 전용). iOS 앱은 카카오 같은 외부 로그인만 두면
 * App Store 심사 지침 4.8 에 걸리므로 Apple 로그인을 함께 제공한다.
 *
 * 환경변수가 모두 있을 때만 켜진다 — 없으면 지금처럼 카카오만 쓴다.
 * - APPLE_CLIENT_ID: Services ID (웹 로그인용 식별자, 예: ing.boogie.seedbook.web)
 * - APPLE_TEAM_ID / APPLE_KEY_ID: 개발자 계정 Team ID, Sign in with Apple 키 ID
 * - APPLE_PRIVATE_KEY_BASE64: 키 파일(.p8) 내용을 base64 로 한 줄 인코딩한 값
 *   (`base64 -i AuthKey_XXXX.p8`). 여러 줄 PEM 은 배포 .env 에 안전하게 못 넣는다.
 * - APPLE_APP_BUNDLE_ID (선택): 네이티브 앱에서 받은 id token 의 audience (번들 ID). 쉼표로 여럿을 줄 수 있다.
 *
 * 개발 서버(`NODE_ENV=development`)는 개발용 앱 Seedbook Dev(`DEV_APP_BUNDLE_ID`)의 토큰도 받는다 — Dev 앱은
 * 로컬 dev 서버에만 붙는다 (apps/mobile/README.md "Seedbook Dev"). 운영 서버는 설정한 번들 ID 만 받는다.
 */

/** 개발용 앱(Seedbook Dev)의 iOS 번들 ID. 출시 앱(`ing.boogie.seedbook`)과 나란히 설치된다. */
export const DEV_APP_BUNDLE_ID = "ing.boogie.seedbook.dev";

export interface AppleConfig {
  clientId: string;
  teamId: string;
  keyId: string;
  privateKey: string;
  /** 네이티브 앱 id token 의 audience 로 받을 번들 ID 들. */
  appBundleIdentifiers: string[];
}

type Env = Record<string, string | undefined>;

function present(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function readAppleConfig(env: Env): AppleConfig | null {
  const clientId = present(env.APPLE_CLIENT_ID);
  const teamId = present(env.APPLE_TEAM_ID);
  const keyId = present(env.APPLE_KEY_ID);
  const privateKeyBase64 = present(env.APPLE_PRIVATE_KEY_BASE64);
  if (!clientId || !teamId || !keyId || !privateKeyBase64) return null;

  return {
    clientId,
    teamId,
    keyId,
    privateKey: Buffer.from(privateKeyBase64, "base64").toString("utf8"),
    appBundleIdentifiers: appBundleIdentifiers(env),
  };
}

function appBundleIdentifiers(env: Env): string[] {
  const configured = (env.APPLE_APP_BUNDLE_ID ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  const ids = env.NODE_ENV === "development" ? [...configured, DEV_APP_BUNDLE_ID] : configured;
  return [...new Set(ids)];
}

/**
 * Apple 은 client secret 으로 키로 서명한 JWT 를 받는다 (최대 6개월 유효). 서버 기동 때
 * 새로 만들므로 배포·재시작마다 갱신된다. 180일 동안 재시작이 없으면 만료되니 주의.
 */
export const APPLE_CLIENT_SECRET_TTL_SECONDS = 180 * 24 * 60 * 60;

const APPLE_AUDIENCE = "https://appleid.apple.com";

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function createAppleClientSecret(
  config: Pick<AppleConfig, "clientId" | "teamId" | "keyId" | "privateKey">,
  now: Date = new Date()
): string {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const header = base64UrlJson({ alg: "ES256", kid: config.keyId });
  const payload = base64UrlJson({
    iss: config.teamId,
    iat: issuedAt,
    exp: issuedAt + APPLE_CLIENT_SECRET_TTL_SECONDS,
    aud: APPLE_AUDIENCE,
    sub: config.clientId,
  });
  const signingInput = `${header}.${payload}`;
  // JWS ES256 는 DER 이 아닌 r||s (64바이트) 서명을 쓴다.
  const signature = sign("sha256", Buffer.from(signingInput), {
    key: config.privateKey,
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${signature.toString("base64url")}`;
}
