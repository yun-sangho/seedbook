#!/usr/bin/env node
// OTA 앱 번들 운영 (`.github/workflows/app-bundle.yml` 이 부른다. 로컬 dev 서버 QA 에도 쓴다).
//
//   node scripts/app-bundle.mjs publish --server <URL> [--dist apps/mobile/dist] [--min-native 1.0.0]
//       --build <커밋 sha> --run <run 번호>
//     Vite 빌드 결과(dist)를 zip → 체크섬·서명 → 앱 공개 키로 서명 확인 → 업로드 (beta 채널).
//   node scripts/app-bundle.mjs promote <id> --server <URL> --rollout <0~100>   production 채널로 (그 비율의 기기만)
//   node scripts/app-bundle.mjs halt <id> --server <URL> [--reason "…"]           내린다
//   node scripts/app-bundle.mjs list --server <URL>                               최근 번들과 기기 보고 수
//
// env: APP_BUNDLE_ADMIN_TOKEN (운영자 API), publish 는 APP_BUNDLE_SIGNING_KEY (개인 키 PEM) 와
// APP_BUNDLE_PUBLIC_KEY (앱에 넣는 공개 키 PEM). 키 값은 출력하지 않는다.
// 결과는 stdout, GITHUB_STEP_SUMMARY 가 있으면 거기에도 적는다.

import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  assertAppPublicKey,
  bundleIdFor,
  bundlesTable,
  isAppVersion,
  parseRolloutPercent,
  publishUrl,
  signBundle,
  verifyBundleSignature,
} from "./app-bundle-lib.mjs";

const ROOT = resolve(import.meta.dirname, "..");

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

/** GitHub Actions 의 step summary 파일 (로컬에서는 없다). */
const SUMMARY_ENV = "GITHUB_STEP_SUMMARY";

function summary(markdown) {
  console.log(markdown);
  const file = process.env[SUMMARY_ENV];
  if (file) appendFileSync(file, `${markdown}\n`);
}

function env(name) {
  const value = process.env[name]?.trim();
  if (!value) fail(`env ${name} 가 없다 — apps/mobile/README.md "OTA 번들" 참고`);
  return value;
}

async function api(server, path, init = {}) {
  const response = await fetch(`${server.replace(/\/+$/, "")}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${env("APP_BUNDLE_ADMIN_TOKEN")}`, ...init.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    fail(`${init.method ?? "GET"} ${path} → ${response.status} ${JSON.stringify(body)}`);
  return body;
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    server: { type: "string" },
    dist: { type: "string", default: "apps/mobile/dist" },
    "min-native": { type: "string" },
    build: { type: "string" },
    run: { type: "string" },
    rollout: { type: "string" },
    reason: { type: "string" },
  },
});
const [command, id] = positionals;
const server = values.server ?? fail("--server <URL> 가 필요하다");

if (command === "publish") {
  const dist = resolve(ROOT, values.dist);
  if (!existsSync(join(dist, "index.html"))) fail(`${dist}/index.html 이 없다 — 먼저 vite build`);
  const appVersion = JSON.parse(
    readFileSync(join(ROOT, "apps/mobile/package.json"), "utf8")
  ).version;
  const minNative = values["min-native"] || appVersion;
  if (!isAppVersion(minNative)) fail(`--min-native 는 major.minor.patch: ${minNative}`);
  const build = values.build ?? fail("--build <커밋 sha> 가 필요하다");
  const bundleId = bundleIdFor(build, values.run ?? fail("--run <run 번호> 가 필요하다"));

  const publicKey = env("APP_BUNDLE_PUBLIC_KEY");
  assertAppPublicKey(publicKey);
  const work = mkdtempSync(join(tmpdir(), "app-bundle-"));
  try {
    const zipPath = join(work, `${bundleId}.zip`);
    // -X: 파일 시각 외 속성을 빼 같은 dist 면 같은 zip 에 가깝게.
    execFileSync("zip", ["-qrX", zipPath, "."], { cwd: dist });
    const zip = readFileSync(zipPath);
    const { checksum, signature } = signBundle(zip, env("APP_BUNDLE_SIGNING_KEY"));
    if (!verifyBundleSignature(zip, signature, publicKey)) {
      fail("서명 키와 앱 공개 키(APP_BUNDLE_PUBLIC_KEY)가 짝이 아니다 — 올리면 앱이 받지 못한다");
    }
    const response = await fetch(
      publishUrl(server, { id: bundleId, appVersion, minNative, build, checksum, signature }),
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${env("APP_BUNDLE_ADMIN_TOKEN")}`,
          "content-type": "application/zip",
        },
        body: zip,
      }
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok) fail(`업로드 실패 ${response.status} ${JSON.stringify(body)}`);
    summary(
      [
        `### OTA 번들 \`${bundleId}\` 을 beta 채널에 올렸다`,
        `- 앱 버전 ${appVersion}, 최소 바이너리 ${minNative}, ${(zip.length / 1024).toFixed(0)}KB`,
        `- 확인 뒤 production 승격: \`gh workflow run app-bundle.yml -f action=promote -f bundle_id=${bundleId} -f rollout_percent=20\``,
      ].join("\n")
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
} else if (command === "promote") {
  if (!id) fail("promote <번들 id>");
  const rolloutPercent = parseRolloutPercent(values.rollout ?? "100");
  const body = await api(server, `/api/app-bundle/admin/bundles/${id}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "promote", rolloutPercent }),
  });
  summary(`### \`${id}\` → production ${rolloutPercent}% (${body.result})`);
} else if (command === "halt") {
  if (!id) fail("halt <번들 id>");
  const body = await api(server, `/api/app-bundle/admin/bundles/${id}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "halt", reason: values.reason ?? "운영자가 내림" }),
  });
  summary(`### \`${id}\` 를 내렸다 (${body.result})`);
} else if (command === "list") {
  const { bundles } = await api(server, "/api/app-bundle/admin/bundles");
  summary(`### OTA 번들 (최근)\n\n${bundles.length ? bundlesTable(bundles) : "올린 번들이 없다."}`);
} else {
  fail("명령: publish | promote <id> | halt <id> | list");
}
