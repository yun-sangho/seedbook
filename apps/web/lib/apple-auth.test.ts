import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  APPLE_CLIENT_SECRET_TTL_SECONDS,
  createAppleClientSecret,
  readAppleConfig,
} from "./apple-auth";

function base64UrlDecodeJson(part: string) {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

function newP8Key() {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  return { pem, publicKey };
}

const COMPLETE_ENV = {
  APPLE_CLIENT_ID: "ing.boogie.seedbook.web",
  APPLE_TEAM_ID: "TEAM123456",
  APPLE_KEY_ID: "KEY1234567",
  APPLE_PRIVATE_KEY_BASE64: Buffer.from(
    "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n"
  ).toString("base64"),
};

describe("readAppleConfig", () => {
  it("returns null when Apple credentials are not configured", () => {
    expect(readAppleConfig({})).toBeNull();
  });

  it("returns null when any one credential is missing", () => {
    const { APPLE_KEY_ID: _omitted, ...partial } = COMPLETE_ENV;
    expect(readAppleConfig(partial)).toBeNull();
  });

  it("treats whitespace-only values as missing", () => {
    expect(readAppleConfig({ ...COMPLETE_ENV, APPLE_TEAM_ID: "  " })).toBeNull();
  });

  it("decodes the base64 private key into PEM text", () => {
    const config = readAppleConfig(COMPLETE_ENV);
    expect(config?.privateKey).toContain("-----BEGIN PRIVATE KEY-----");
  });

  it("passes the iOS bundle id through when set", () => {
    const config = readAppleConfig({ ...COMPLETE_ENV, APPLE_APP_BUNDLE_ID: "ing.boogie.seedbook" });
    expect(config?.appBundleIdentifier).toBe("ing.boogie.seedbook");
  });
});

describe("createAppleClientSecret", () => {
  const { pem, publicKey } = newP8Key();
  const now = new Date("2026-11-15T00:00:00Z");
  const secret = createAppleClientSecret(
    {
      clientId: "ing.boogie.seedbook.web",
      teamId: "TEAM123456",
      keyId: "KEY1234567",
      privateKey: pem,
    },
    now
  );
  const [header = "", payload = "", signature = ""] = secret.split(".");

  it("uses ES256 with the Apple key id in the header", () => {
    expect(base64UrlDecodeJson(header)).toEqual({ alg: "ES256", kid: "KEY1234567" });
  });

  it("claims the team as issuer and the Services ID as subject for Apple's audience", () => {
    expect(base64UrlDecodeJson(payload)).toMatchObject({
      iss: "TEAM123456",
      sub: "ing.boogie.seedbook.web",
      aud: "https://appleid.apple.com",
      iat: now.getTime() / 1000,
    });
  });

  it("expires within Apple's six-month limit", () => {
    const { iat, exp } = base64UrlDecodeJson(payload);
    expect(exp - iat).toBe(APPLE_CLIENT_SECRET_TTL_SECONDS);
    expect(APPLE_CLIENT_SECRET_TTL_SECONDS).toBeLessThanOrEqual(15_777_000);
  });

  it("is signed by the given private key (raw r||s signature)", () => {
    const valid = verify(
      "sha256",
      Buffer.from(`${header}.${payload}`),
      {
        key: createPublicKey(publicKey.export({ type: "spki", format: "pem" })),
        dsaEncoding: "ieee-p1363",
      },
      Buffer.from(signature, "base64url")
    );
    expect(valid).toBe(true);
  });
});
