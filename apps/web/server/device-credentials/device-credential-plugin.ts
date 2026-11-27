import type { Database } from "@seedbook/database";
import type { BetterAuthPlugin } from "better-auth";
import {
  APIError,
  createAuthEndpoint,
  freshSessionMiddleware,
  sessionMiddleware,
} from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import {
  createDeviceCredential,
  revokeDeviceCredential,
  verifyDeviceCredential,
} from "./device-credentials";

/**
 * 생체 인증 로그인 (네이티브 앱) 엔드포인트. 토큰 저장 규칙은 `device-credentials.ts`.
 *
 * - `POST /api/auth/device-credential/enroll`: 최근에 로그인한 세션 (freshAge, 기본 1일) 으로만
 *   토큰을 발급한다. 토큰 원문은 이 응답에서 한 번만 내려간다.
 * - `POST /api/auth/device-credential/sign-in`: 토큰이 맞으면 새 세션을 만들어 일반 로그인과 같은
 *   세션 쿠키를 건다.
 * - `POST /api/auth/device-credential/revoke`: 본인 자격 증명을 지운다 (기능 끄기).
 */

const MAX_FIELD_LENGTH = 256;

function readString(body: unknown, key: string): string | null {
  if (typeof body !== "object" || body === null) return null;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 && value.length <= MAX_FIELD_LENGTH
    ? value
    : null;
}

export function deviceCredentialPlugin(options: { db: Database }) {
  const { db } = options;
  return {
    id: "device-credential",
    endpoints: {
      enrollDeviceCredential: createAuthEndpoint(
        "/device-credential/enroll",
        { method: "POST", use: [freshSessionMiddleware] },
        async (ctx) => {
          const credential = await createDeviceCredential(db, {
            userId: ctx.context.session.user.id,
            now: new Date(),
          });
          return ctx.json(credential);
        }
      ),
      signInWithDeviceCredential: createAuthEndpoint(
        "/device-credential/sign-in",
        { method: "POST" },
        async (ctx) => {
          const credentialId = readString(ctx.body, "credentialId");
          const token = readString(ctx.body, "token");
          if (!credentialId || !token) {
            throw new APIError("BAD_REQUEST", { message: "credentialId and token are required" });
          }

          const userId = await verifyDeviceCredential(db, { credentialId, token, now: new Date() });
          const user = userId ? await ctx.context.internalAdapter.findUserById(userId) : null;
          if (!user) {
            throw new APIError("UNAUTHORIZED", {
              message: "Invalid device credential",
              code: "INVALID_DEVICE_CREDENTIAL",
            });
          }

          const session = await ctx.context.internalAdapter.createSession(user.id);
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ ok: true });
        }
      ),
      revokeDeviceCredential: createAuthEndpoint(
        "/device-credential/revoke",
        { method: "POST", use: [sessionMiddleware] },
        async (ctx) => {
          const credentialId = readString(ctx.body, "credentialId");
          if (!credentialId) {
            throw new APIError("BAD_REQUEST", { message: "credentialId is required" });
          }
          await revokeDeviceCredential(db, { userId: ctx.context.session.user.id, credentialId });
          return ctx.json({ ok: true });
        }
      ),
    },
  } satisfies BetterAuthPlugin;
}
