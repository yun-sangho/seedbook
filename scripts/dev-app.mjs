/**
 * 개발용 앱 Seedbook Dev 를 만들어 기기에 바로 설치한다. 출시 앱과 나란히 설치되고 (`ing.boogie.seedbook.dev`),
 * 운영이 아니라 이 맥의 dev 서버(같은 Wi-Fi, `http://<맥 LAN IP>:<슬롯 web 포트>`, 슬롯 DB)에 붙는다.
 *
 *   pnpm --filter @seedbook/mobile dev:ios-device       # 연결된 아이폰
 *   pnpm --filter @seedbook/mobile dev:android-device   # adb 로 연결된 Android 기기
 *
 * 순서: 슬롯 web 포트(`pnpm wt:info`)·맥 LAN IP 확인 → dev 서버가 그 주소로 응답하는지 확인 →
 * `vite build --mode development` (SEEDBOOK_API_BASE_URL = 그 주소, 개발용 빠른 로그인이 보인다) →
 * `cap sync` (SEEDBOOK_DEV_APP=1) → fastlane `dev` lane (iOS Dev 빌드 구성 / Android dev 빌드 타입, 설치·실행).
 *
 * 환경변수 (모두 선택): SEEDBOOK_DEV_HOST (LAN IP 대신 쓸 주소), SEEDBOOK_IOS_DEVICE (아이폰 UDID),
 * APPLE_TEAM_ID (없으면 키체인의 Apple Development 인증서에서), KAKAO_NATIVE_APP_KEY (없으면 .env.local).
 * 시뮬레이터·에뮬레이터는 띄우지 않는다.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { networkInterfaces, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  devAppApiBaseUrl,
  parseWebPort,
  pickIosDevice,
  pickLanAddress,
  readEnvValue,
  teamIdFromCertificateSubject,
} from "./dev-app-lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MOBILE = path.join(ROOT, "apps/mobile");
/** turbo 밖에서 직접 도는 스크립트라 env 를 turbo.json 에 적지 않는다. */
const env = process.env;
const JDK21_HOME = "/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home";

function log(message) {
  console.log(`[dev-app] ${message}`);
}

function fail(message) {
  console.error(`[dev-app] ${message}`);
  process.exit(1);
}

function run(command, args, { cwd = MOBILE, env: extraEnv = {} } = {}) {
  log(`$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: { ...env, ...extraEnv },
  });
  if (result.status !== 0) fail(`${command} ${args[0] ?? ""} 실패 (exit ${result.status})`);
}

function output(command, args, options = {}) {
  return execFileSync(command, args, { encoding: "utf8", ...options });
}

function slotWebPort() {
  const port = parseWebPort(output("node", [path.join(ROOT, "scripts/worktree.mjs"), "info"]));
  if (!port) fail("pnpm wt:info 에서 web 포트를 읽지 못했다");
  return port;
}

async function assertDevServer(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/api/app-config`, {
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) return;
    fail(`${baseUrl}/api/app-config 가 ${response.status} 로 답했다 — pnpm dev 로그를 본다`);
  } catch {
    fail(
      `${baseUrl} 에 닿지 않는다 — 이 체크아웃에서 pnpm dev 를 먼저 띄운다 (방화벽이 node 를 막지 않는지도 본다)`
    );
  }
}

/** 카카오 네이티브 앱 키: 환경변수, 없으면 로컬 환경 파일 (dev 서버가 같은 키로 ID 토큰을 확인한다). */
function kakaoNativeAppKey() {
  if (env.KAKAO_NATIVE_APP_KEY?.trim()) return env.KAKAO_NATIVE_APP_KEY.trim();
  for (const file of ["apps/web/.env.local", ".env.local"]) {
    const full = path.join(ROOT, file);
    if (!existsSync(full)) continue;
    const value = readEnvValue(readFileSync(full, "utf8"), "KAKAO_NATIVE_APP_KEY");
    if (value) return value;
  }
  log(
    "KAKAO_NATIVE_APP_KEY 가 없어 카카오 로그인 버튼이 빠진 빌드가 된다 (개발용 빠른 로그인은 된다)"
  );
  return "";
}

function iosDevice() {
  const chosen = env.SEEDBOOK_IOS_DEVICE?.trim();
  if (chosen) return chosen;
  const dir = mkdtempSync(path.join(tmpdir(), "seedbook-devicectl-"));
  const file = path.join(dir, "devices.json");
  try {
    output("xcrun", ["devicectl", "list", "devices", "--json-output", file], { stdio: "ignore" });
    const device = pickIosDevice(JSON.parse(readFileSync(file, "utf8")));
    log(`아이폰: ${device.name} (${device.udid})`);
    return device.udid;
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function appleTeamId() {
  if (env.APPLE_TEAM_ID?.trim()) return env.APPLE_TEAM_ID.trim();
  try {
    const pem = output("security", ["find-certificate", "-c", "Apple Development", "-p"]);
    const subject = output("openssl", ["x509", "-noout", "-subject"], { input: pem });
    const team = teamIdFromCertificateSubject(subject);
    if (team) return team;
  } catch {
    // 아래에서 안내
  }
  fail("Apple 팀 ID 를 찾지 못했다 — Xcode 에 Apple 계정으로 로그인하거나 APPLE_TEAM_ID 를 준다");
}

function ensureBundle() {
  const check = spawnSync("bundle", ["check"], { cwd: MOBILE, stdio: "ignore" });
  if (check.status !== 0) run("bundle", ["install"]);
}

function gitShortSha() {
  try {
    return output("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT }).trim();
  } catch {
    return "local";
  }
}

async function main() {
  const platform = process.argv[2];
  if (platform !== "ios" && platform !== "android") {
    fail("usage: dev-app.mjs <ios|android>");
  }

  const port = slotWebPort();
  const host = env.SEEDBOOK_DEV_HOST?.trim() || pickLanAddress(networkInterfaces());
  if (!host) fail("맥의 LAN IP 를 찾지 못했다 — Wi-Fi 에 연결하거나 SEEDBOOK_DEV_HOST 를 준다");
  const baseUrl = devAppApiBaseUrl({ host, port });
  await assertDevServer(baseUrl);
  log(`Seedbook Dev → ${baseUrl} (이 체크아웃의 dev 서버·슬롯 DB)`);

  // 개발 빌드: NODE_ENV=development 라 로그인 화면에 "개발용 빠른 로그인" 이 보인다.
  run("pnpm", ["exec", "vite", "build", "--mode", "development"], {
    env: { SEEDBOOK_API_BASE_URL: baseUrl, SEEDBOOK_APP_BUILD: `dev-${gitShortSha()}` },
  });
  run("pnpm", ["exec", "cap", "sync", platform], { env: { SEEDBOOK_DEV_APP: "1" } });

  ensureBundle();
  const kakaoKey = kakaoNativeAppKey();
  if (platform === "ios") {
    run("bundle", ["exec", "fastlane", "ios", "dev"], {
      env: {
        SEEDBOOK_IOS_DEVICE: iosDevice(),
        APPLE_TEAM_ID: appleTeamId(),
        KAKAO_NATIVE_APP_KEY: kakaoKey,
      },
    });
  } else {
    run("bundle", ["exec", "fastlane", "android", "dev"], {
      env: {
        KAKAO_NATIVE_APP_KEY: kakaoKey,
        ...(!env.JAVA_HOME && existsSync(JDK21_HOME) ? { JAVA_HOME: JDK21_HOME } : {}),
      },
    });
  }
  log(
    "설치했다. 출시 빌드로 돌아갈 때는 env 없이 pnpm --filter @seedbook/mobile sync 로 번들을 다시 넣는다"
  );
}

await main();
