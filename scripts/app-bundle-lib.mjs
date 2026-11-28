// OTA 번들 운영 스크립트(scripts/app-bundle.mjs)의 순수 로직. 테스트: apps/web/test/app-bundle/app-bundle-lib.test.ts
import { createHash, createPublicKey, sign, verify } from "node:crypto";

/** 플러그인(iOS)이 2048비트 RSA 키로 서명을 확인한다 (`kSecAttrKeySizeInBits: 2048`). */
export const RSA_KEY_BITS = 2048;

/** 번들 id: 커밋 sha 앞 12자 + 워크플로 run 번호 (같은 커밋을 다시 올려도 겹치지 않게). */
export function bundleIdFor(sha, runNumber) {
  if (!/^[0-9a-f]{12,40}$/.test(sha)) throw new Error(`커밋 sha 가 아니다: ${sha}`);
  if (!/^[1-9]\d*$/.test(String(runNumber))) throw new Error(`run 번호가 아니다: ${runNumber}`);
  return `${sha.slice(0, 12)}-${runNumber}`;
}

/**
 * zip 의 체크섬(SHA-256 hex)과 서명(base64). 서명은 zip 의 SHA-256 에 대한 RSA PKCS#1 v1.5 —
 * `@capawesome/capacitor-live-update` 가 확인하는 모양(`openssl dgst -sha256 -sign key.pem bundle.zip`)과 같다.
 */
export function signBundle(zip, privateKeyPem) {
  const checksum = createHash("sha256").update(zip).digest("hex");
  const signature = sign("sha256", zip, privateKeyPem).toString("base64");
  return { checksum, signature };
}

/** 앱에 넣은 공개 키로 서명을 확인한다 — 다른 키로 서명한 번들을 올리지 않는다. */
export function verifyBundleSignature(zip, signature, publicKeyPem) {
  return verify("sha256", zip, publicKeyPem, Buffer.from(signature, "base64"));
}

/** 공개 키가 앱이 확인할 수 있는 모양(PEM SPKI, 2048비트 RSA)인지. 아니면 이유를 던진다. */
export function assertAppPublicKey(publicKeyPem) {
  if (!publicKeyPem.includes("-----BEGIN PUBLIC KEY-----")) {
    throw new Error("공개 키는 `-----BEGIN PUBLIC KEY-----` PEM 이어야 한다 (openssl rsa -pubout)");
  }
  const key = createPublicKey(publicKeyPem);
  const bits = key.asymmetricKeyDetails?.modulusLength;
  if (key.asymmetricKeyType !== "rsa" || bits !== RSA_KEY_BITS) {
    throw new Error(
      `공개 키는 ${RSA_KEY_BITS}비트 RSA 여야 한다 (지금: ${key.asymmetricKeyType} ${bits})`
    );
  }
}

/** 업로드 주소 (메타는 쿼리, 본문은 zip). */
export function publishUrl(server, meta) {
  const params = new URLSearchParams({
    id: meta.id,
    appVersion: meta.appVersion,
    minNative: meta.minNative,
    build: meta.build,
    checksum: meta.checksum,
    signature: meta.signature,
  });
  return `${server.replace(/\/+$/, "")}/api/app-bundle/admin/bundles?${params}`;
}

/** semver `major.minor.patch` 인지. */
export function isAppVersion(value) {
  return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value);
}

/** 승격 비율 (0~100 정수). */
export function parseRolloutPercent(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 100) throw new Error(`비율은 0~100 정수: ${value}`);
  return n;
}

/** 운영자 목록을 사람이 읽는 표로 (GitHub step summary). */
export function bundlesTable(bundles) {
  const rows = bundles.map((b) => {
    const state = b.haltedAt
      ? `내려짐 (${b.haltReason ?? ""})`
      : b.promotedAt
        ? `production ${b.rolloutPercent}%`
        : "beta";
    const r = b.reports;
    return `| \`${b.id}\` | ${b.appVersion} (≥${b.minNative}) | ${state} | ${r.applied} / ${r.rolled_back} / ${r.verify_failed} / ${r.download_failed} | ${String(b.createdAt).slice(0, 16)} |`;
  });
  return [
    "| 번들 | 앱 버전 (최소 바이너리) | 상태 | 적용 / 롤백 / 검증 실패 / 받기 실패 | 올린 때 |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}
