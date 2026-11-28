import { createLocalJWKSet, exportJWK, generateKeyPair, type JWTPayload, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { createKakaoIdTokenVerifier, KAKAO_ISSUER, kakaoIdTokenAudiences } from "./kakao-id-token";

const NATIVE_APP_KEY = "native-app-key";
const NONCE = "nonce-123";

let kakaoKey: CryptoKey;
let otherKey: CryptoKey;
let jwks: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const kakao = await generateKeyPair("RS256");
  const other = await generateKeyPair("RS256");
  kakaoKey = kakao.privateKey;
  otherKey = other.privateKey;
  const publicJwk = { ...(await exportJWK(kakao.publicKey)), kid: "kakao-1", alg: "RS256" };
  jwks = createLocalJWKSet({ keys: [publicJwk] });
});

async function idToken(
  claims: JWTPayload = {},
  options: { key?: CryptoKey; issuedAt?: number } = {}
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ nonce: NONCE, ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "kakao-1" })
    .setIssuer(KAKAO_ISSUER)
    .setAudience(NATIVE_APP_KEY)
    .setSubject("1234567890")
    .setIssuedAt(options.issuedAt ?? now)
    .setExpirationTime((options.issuedAt ?? now) + 6 * 60 * 60)
    .sign(options.key ?? kakaoKey);
}

describe("createKakaoIdTokenVerifier", () => {
  it("accepts a Kakao-signed token for our app with the matching nonce", async () => {
    const verify = createKakaoIdTokenVerifier({ audiences: [NATIVE_APP_KEY], jwks });
    expect(await verify(await idToken(), NONCE)).toBe(true);
  });

  it("rejects a token signed by another key", async () => {
    const verify = createKakaoIdTokenVerifier({ audiences: [NATIVE_APP_KEY], jwks });
    expect(await verify(await idToken({}, { key: otherKey }), NONCE)).toBe(false);
  });

  it("rejects a token issued for another app", async () => {
    const verify = createKakaoIdTokenVerifier({ audiences: ["someone-elses-key"], jwks });
    expect(await verify(await idToken(), NONCE)).toBe(false);
  });

  it("rejects a token from another issuer", async () => {
    const verify = createKakaoIdTokenVerifier({ audiences: [NATIVE_APP_KEY], jwks });
    const token = await new SignJWT({ nonce: NONCE })
      .setProtectedHeader({ alg: "RS256", kid: "kakao-1" })
      .setIssuer("https://evil.example")
      .setAudience(NATIVE_APP_KEY)
      .setSubject("1")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(kakaoKey);
    expect(await verify(token, NONCE)).toBe(false);
  });

  it("rejects a nonce mismatch or a missing nonce", async () => {
    const verify = createKakaoIdTokenVerifier({ audiences: [NATIVE_APP_KEY], jwks });
    const token = await idToken();
    expect(await verify(token, "other-nonce")).toBe(false);
    expect(await verify(token, undefined)).toBe(false);
  });

  it("rejects a token issued more than 10 minutes ago", async () => {
    const verify = createKakaoIdTokenVerifier({ audiences: [NATIVE_APP_KEY], jwks });
    const elevenMinutesAgo = Math.floor(Date.now() / 1000) - 11 * 60;
    expect(await verify(await idToken({}, { issuedAt: elevenMinutesAgo }), NONCE)).toBe(false);
  });

  it("rejects everything when no audience is configured", async () => {
    const verify = createKakaoIdTokenVerifier({ audiences: [], jwks });
    expect(await verify(await idToken(), NONCE)).toBe(false);
  });

  it("returns false for garbage instead of throwing", async () => {
    const verify = createKakaoIdTokenVerifier({ audiences: [NATIVE_APP_KEY], jwks });
    expect(await verify("not-a-jwt", NONCE)).toBe(false);
  });
});

describe("kakaoIdTokenAudiences", () => {
  it("uses the native app key and the REST API key, skipping blanks", () => {
    expect(
      kakaoIdTokenAudiences({ KAKAO_NATIVE_APP_KEY: " native \n", KAKAO_CLIENT_ID: "rest" })
    ).toEqual(["native", "rest"]);
    expect(kakaoIdTokenAudiences({ KAKAO_NATIVE_APP_KEY: "", KAKAO_CLIENT_ID: undefined })).toEqual(
      []
    );
  });
});
