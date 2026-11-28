import { type Database, schema } from "@seedbook/database";
import { ANONYMOUS_USER_NAME, anonymousEmail } from "@seedbook/domain/anonymous-identity";
import {
  nicknameError,
  normalizeNickname,
  profileImageError,
} from "@web/lib/seed-identity/profile";
import { parseProfileImage } from "@web/lib/seed-identity/profile-image";
import type { BetterAuthOptions } from "better-auth";
import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";

/**
 * 로그인에서 신상 정보를 저장하지 않게 하는 better-auth 설정 (`packages/database/src/anonymous-identity.ts`).
 *
 * - 카카오·Apple 에 동의 항목(이름·이메일·사진)을 요청하지 않고 식별 번호만 쓴다.
 * - better-auth 가 요구하는 `user.email`·`user.name` 은 식별 번호로 만든 고정 값으로 채운다. 이미 가입한
 *   사람은 (provider, 식별 번호) 로 계정을 찾으므로 다시 로그인해도 같은 계정이다.
 * - 재로그인이 이름·사진을 provider 프로필로 덮어쓰지 않는다 (`overrideUserInfoOnSignIn` 기본값 false).
 * - OAuth 토큰과 세션의 접속 IP·User-Agent 를 DB 에 남기지 않는다 (`privacyDatabaseHooks`).
 * - 사용자가 바꾸는 이름은 닉네임 규칙을, 사진은 씨앗 아바타 키나 본인 포트폴리오 식물 키만 받는다
 *   (`lib/seed-identity/profile.ts`, `profile-image.ts`).
 * - 로그인 수단 연결은 사용자가 로그인한 채로 직접 할 때만 된다 (`privacyAccountOptions`).
 */

/** 신상 정보 없는 사용자 필드. provider 가 준 이름·사진은 버린다. */
export function anonymousUserFields(providerId: string, accountId: string | number) {
  return {
    email: anonymousEmail(providerId, String(accountId)),
    name: ANONYMOUS_USER_NAME,
    image: undefined,
    emailVerified: false,
  };
}

export function kakaoProviderOptions(credentials: { clientId: string; clientSecret: string }) {
  return {
    ...credentials,
    // 동의 항목을 하나도 요청하지 않는다 — 카카오 회원번호만 받는다.
    disableDefaultScope: true,
    scope: [],
    mapProfileToUser: (profile: { id: number | string }) =>
      anonymousUserFields("kakao", profile.id),
  };
}

export function appleProviderOptions<T extends object>(credentials: T) {
  return {
    ...credentials,
    // email·name 범위를 요청하지 않는다 — id token 의 sub 만 쓴다.
    disableDefaultScope: true,
    scope: [],
    mapProfileToUser: (profile: { sub: string }) => anonymousUserFields("apple", profile.sub),
  };
}

/**
 * better-auth 계정(로그인 수단) 설정.
 *
 * 고정 이메일은 provider·식별 번호마다 달라(`kakao-1@…`, `apple-x@…`) 같은 사람이라도 이메일로는
 * 이어지지 않는다. 그래서
 * - 로그인할 때 이메일이 같다고 계정을 묵시적으로 잇지 않는다 (`disableImplicitLinking`). 연결을
 *   해제한 수단으로 다시 로그인하면 원래 사용자의 고정 이메일과 겹쳐 `account_not_linked` 로 막힌다.
 * - 로그인한 사용자가 `linkSocial` 로 직접 잇는 것만 허용한다. 이메일이 다를 수밖에 없고
 *   (`allowDifferentEmails`), provider 가 이메일 인증 여부를 주지 않으므로 우리 두 provider 를
 *   믿는다 (`trustedProviders` — 이것이 없으면 `emailVerified: false` 라 연결이 거절된다).
 * - 이미 다른 사용자에 연결된 수단은 better-auth 가 `account_already_linked_to_different_user` 로
 *   거절한다 (계정 병합은 하지 않는다).
 * - 연결해도 provider 프로필로 이름·사진을 덮어쓰지 않는다 (`updateUserInfoOnLink: false`).
 * - 마지막 수단은 해제할 수 없다 (`allowUnlinkingAll` 기본값 false).
 * - 토큰을 쓰지 않으므로 재로그인 때 계정 연결 행을 갱신하지 않는다.
 */
export const privacyAccountOptions = {
  updateAccountOnSignIn: false,
  accountLinking: {
    enabled: true,
    disableImplicitLinking: true,
    allowDifferentEmails: true,
    trustedProviders: ["kakao", "apple"],
    updateUserInfoOnLink: false,
    allowUnlinkingAll: false,
  },
} satisfies BetterAuthOptions["account"];

const NO_OAUTH_TOKENS = {
  accessToken: null,
  refreshToken: null,
  idToken: null,
  accessTokenExpiresAt: null,
  refreshTokenExpiresAt: null,
};

const NO_CLIENT_INFO = { ipAddress: null, userAgent: null };

/**
 * 아바타로 고른 식물이 다른 사용자의 포트폴리오면 true. 서버에 없는 포트폴리오는 받는다 — local 모드
 * 사용자의 포트폴리오는 기기에만 있다. 그런 키는 화면이 그 포트폴리오를 못 찾아 기본값으로 그린다.
 */
async function isForeignPortfolio(db: Database, portfolioId: string, userId: string | undefined) {
  const [row] = await db
    .select({ userId: schema.portfolio.userId })
    .from(schema.portfolio)
    .where(eq(schema.portfolio.id, portfolioId));
  return row !== undefined && row.userId !== userId;
}

/**
 * 프로필 수정(`updateUser`)이 닉네임 규칙을 어기거나 사진 URL·남의 포트폴리오 식물을 넣으면 거절한다.
 * 닉네임은 공백을 정리해 저장한다.
 */
function profileUpdateValidator(db: Database) {
  return async <T extends { name?: unknown; image?: unknown }>(
    data: T,
    context: { context: { session?: { user: { id: string } } | null } } | null
  ) => {
    const next = { ...data };
    if (typeof data.name === "string") {
      if (nicknameError(data.name)) {
        throw new APIError("BAD_REQUEST", { message: "invalid nickname" });
      }
      next.name = normalizeNickname(data.name);
    }
    if (data.image !== undefined) {
      const image = typeof data.image === "string" ? data.image : null;
      if (data.image !== null && (image === null || profileImageError(image))) {
        throw new APIError("BAD_REQUEST", { message: "image must be a seed avatar key" });
      }
      const { plantPortfolioId } = parseProfileImage(image);
      if (
        plantPortfolioId !== null &&
        (await isForeignPortfolio(db, plantPortfolioId, context?.context.session?.user.id))
      ) {
        throw new APIError("BAD_REQUEST", { message: "plant must be your own portfolio" });
      }
    }
    return { data: next };
  };
}

/**
 * 프로필 수정 검사와, 저장 직전에 OAuth 토큰과 세션 접속 정보를 지우는 훅. `db` 는 식물 아바타의
 * 포트폴리오 주인을 확인하는 데 쓴다.
 *
 * 저장 직전에 OAuth 토큰과 세션 접속 정보를 지운다. better-auth 의 IP 추적 자체(`disableIpTracking`)는
 * 끄지 않는다 — 요청 IP 는 로그인 rate limit 에 쓰이고, 저장만 하지 않으면 된다.
 */
export function privacyDatabaseHooks(db: Database) {
  return {
    user: {
      update: { before: profileUpdateValidator(db) },
    },
    account: {
      create: { before: async (data) => ({ data: { ...data, ...NO_OAUTH_TOKENS } }) },
      update: { before: async (data) => ({ data: { ...data, ...NO_OAUTH_TOKENS } }) },
    },
    session: {
      create: { before: async (data) => ({ data: { ...data, ...NO_CLIENT_INFO } }) },
      update: { before: async (data) => ({ data: { ...data, ...NO_CLIENT_INFO } }) },
    },
  } satisfies BetterAuthOptions["databaseHooks"];
}
