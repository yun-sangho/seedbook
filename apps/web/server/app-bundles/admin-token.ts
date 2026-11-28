import { timingSafeEqual } from "node:crypto";

/**
 * OTA 번들 운영자 API (`/api/app-bundle/admin/*`) 의 인증. GitHub Actions(`.github/workflows/app-bundle.yml`)
 * 만 부른다 — `Authorization: Bearer <APP_BUNDLE_ADMIN_TOKEN>` (GitHub Secret, 서버에는 배포가 env 로 넣는다).
 * 서버에 토큰이 없으면 운영자 API 는 꺼져 있다 (404).
 */

/** 짧거나 빈 토큰으로 API 가 열리지 않게 하는 최소 길이. */
const MIN_TOKEN_LENGTH = 32;

export function adminTokenConfigured(
  token: string | undefined = process.env.APP_BUNDLE_ADMIN_TOKEN
) {
  return typeof token === "string" && token.trim().length >= MIN_TOKEN_LENGTH;
}

/** 요청의 bearer 토큰이 운영자 토큰과 같은지 (시간이 새지 않게 비교). */
export function isAdminRequest(
  authorization: string | null,
  token: string | undefined = process.env.APP_BUNDLE_ADMIN_TOKEN
): boolean {
  if (!adminTokenConfigured(token) || !authorization?.startsWith("Bearer ")) return false;
  const expected = Buffer.from((token as string).trim());
  const given = Buffer.from(authorization.slice("Bearer ".length).trim());
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * 운영자 요청이 아니면 돌려줄 응답, 맞으면 null. 토큰이 꺼져 있으면 404 (API 가 없는 것처럼), 틀리면 401.
 */
export function rejectNonAdmin(request: Request): Response | null {
  if (!adminTokenConfigured()) return Response.json({ error: "not found" }, { status: 404 });
  if (!isAdminRequest(request.headers.get("authorization"))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
