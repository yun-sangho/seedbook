// @vitest-environment node

import { generateKeyPairSync, verify } from "node:crypto";
import { apnsConfigFromEnv, apnsJwt, apnsPayload, isUnregistered } from "@seedbook/database";
import { describe, expect, it } from "vitest";

describe("apnsJwt", () => {
  it("signs an ES256 provider token that verifies with the key", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const now = new Date("2026-11-28T08:00:00Z");
    const jwt = apnsJwt({ keyId: "KEY123", teamId: "TEAM456" }, privateKey, now);
    const [header, claims, signature] = jwt.split(".");

    expect(JSON.parse(Buffer.from(header!, "base64url").toString())).toEqual({
      alg: "ES256",
      kid: "KEY123",
    });
    expect(JSON.parse(Buffer.from(claims!, "base64url").toString())).toEqual({
      iss: "TEAM456",
      iat: now.getTime() / 1000,
    });
    expect(
      verify(
        "sha256",
        Buffer.from(`${header}.${claims}`),
        { key: publicKey, dsaEncoding: "ieee-p1363" },
        Buffer.from(signature!, "base64url")
      )
    ).toBe(true);
  });
});

describe("apnsConfigFromEnv", () => {
  it("is off unless all three values are set", () => {
    expect(apnsConfigFromEnv({ APNS_KEY_ID: "K", APPLE_TEAM_ID: "T" })).toBeNull();
  });
  it("decodes the base64 private key", () => {
    const pem = "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----";
    expect(
      apnsConfigFromEnv({
        APNS_KEY_ID: "K",
        APPLE_TEAM_ID: "T",
        APNS_PRIVATE_KEY_BASE64: Buffer.from(pem).toString("base64"),
      })
    ).toEqual({ keyId: "K", teamId: "T", privateKey: pem });
  });
});

describe("apnsPayload", () => {
  it("puts the alert in aps and data at the top level", () => {
    expect(JSON.parse(apnsPayload({ title: "t", body: "b", data: { kind: "goal" } }))).toEqual({
      aps: { alert: { title: "t", body: "b" }, sound: "default" },
      kind: "goal",
    });
  });
});

describe("isUnregistered", () => {
  it("drops tokens APNs no longer accepts", () => {
    expect(isUnregistered(410, "Unregistered")).toBe(true);
    expect(isUnregistered(400, "BadDeviceToken")).toBe(true);
    expect(isUnregistered(400, "DeviceTokenNotForTopic")).toBe(true);
  });
  it("keeps tokens on other failures", () => {
    expect(isUnregistered(429, "TooManyRequests")).toBe(false);
    expect(isUnregistered(403, "ExpiredProviderToken")).toBe(false);
  });
});
