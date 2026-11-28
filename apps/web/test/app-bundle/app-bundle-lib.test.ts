import { createHash, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assertAppPublicKey,
  bundleIdFor,
  parseRolloutPercent,
  publishUrl,
  signBundle,
  verifyBundleSignature,
} from "../../../../scripts/app-bundle-lib.mjs";

function keyPair(modulusLength = 2048) {
  return generateKeyPairSync("rsa", {
    modulusLength,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

const app = keyPair();
const zip = Buffer.from("PK zip bytes");

describe("bundleIdFor", () => {
  it("joins the first 12 characters of the commit with the run number", () => {
    expect(bundleIdFor("0123456789abcdef0123", 42)).toBe("0123456789ab-42");
  });

  it("refuses something that is not a commit sha", () => {
    expect(() => bundleIdFor("main", 1)).toThrow();
  });
});

describe("signing a bundle", () => {
  it("gives the SHA-256 of the zip as the checksum", () => {
    expect(signBundle(zip, app.privateKey).checksum).toBe(
      createHash("sha256").update(zip).digest("hex")
    );
  });

  it("makes a signature the app's public key accepts", () => {
    const { signature } = signBundle(zip, app.privateKey);

    expect(verifyBundleSignature(zip, signature, app.publicKey)).toBe(true);
  });

  it("is rejected by the app when signed with another key", () => {
    const { signature } = signBundle(zip, keyPair().privateKey);

    expect(verifyBundleSignature(zip, signature, app.publicKey)).toBe(false);
  });

  it("is rejected by the app when the zip was changed", () => {
    const { signature } = signBundle(zip, app.privateKey);

    expect(verifyBundleSignature(Buffer.from("other"), signature, app.publicKey)).toBe(false);
  });
});

describe("assertAppPublicKey", () => {
  it("accepts a 2048-bit RSA public key", () => {
    expect(() => assertAppPublicKey(app.publicKey)).not.toThrow();
  });

  it("refuses a key size the iOS plugin cannot read", () => {
    expect(() => assertAppPublicKey(keyPair(3072).publicKey)).toThrow(/2048/);
  });

  it("refuses a private key pasted by mistake", () => {
    expect(() => assertAppPublicKey(app.privateKey)).toThrow(/PUBLIC KEY/);
  });
});

describe("publishUrl", () => {
  it("puts the metadata in the query of the operator endpoint", () => {
    const url = new URL(
      publishUrl("https://seedbook.example/", {
        id: "abc-1",
        appVersion: "1.0.0",
        minNative: "1.0.0",
        build: "abc",
        checksum: "c",
        signature: "a+b/=",
      })
    );

    expect(url.pathname).toBe("/api/app-bundle/admin/bundles");
    expect(url.searchParams.get("signature")).toBe("a+b/=");
  });
});

describe("parseRolloutPercent", () => {
  it("reads an integer percentage", () => {
    expect(parseRolloutPercent("20")).toBe(20);
  });

  it("refuses more than 100", () => {
    expect(() => parseRolloutPercent("150")).toThrow();
  });
});
