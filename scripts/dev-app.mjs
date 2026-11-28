/**
 * 개발용 앱 Seedbook Dev 를 만들어 시뮬레이터·기기에 바로 설치한다. 출시 앱과 나란히 설치되고
 * (`ing.boogie.seedbook.dev`), 운영이 아니라 이 체크아웃의 dev 서버(슬롯 web 포트, 슬롯 DB)에 붙는다.
 *
 *   pnpm --filter @seedbook/mobile dev:ios-sim          # 이 세션 전용 iOS 시뮬레이터, 창 없이 (네이티브 QA 는 이것으로)
 *   pnpm --filter @seedbook/mobile dev:ios-sim:show     # 사람이 직접 눌러야 할 때 그 시뮬레이터를 Simulator 앱에 띄운다
 *   pnpm --filter @seedbook/mobile dev:ios-sim:stop     # QA 가 끝나면 그 시뮬레이터를 끈다
 *   pnpm --filter @seedbook/mobile dev:ios-device       # 연결된 아이폰 (같은 Wi-Fi)
 *   pnpm --filter @seedbook/mobile dev:android-device   # adb 로 연결된 Android 기기
 *
 * 시뮬레이터는 이름 `seedbook-<워크트리 폴더>` 로 세션마다 하나다 — 없으면 작은 기종(iPhone SE)으로 만들고, 창 없이
 * 켠다(`--window` 면 Simulator 앱에 띄운다). 세션 시뮬레이터는 동시에 2대까지 — 넘으면 켜진 세션을 알려 주고 실패한다
 * (`--force` 로 넘는다). 다른 세션의 시뮬레이터는 끄지 않는다. 지운 워크트리의 시뮬레이터는 `pnpm wt:gc` 가 지운다.
 * 시뮬레이터는 맥과 네트워크를 같이 써서 `http://localhost:<포트>` 로 붙는다.
 *
 * 순서: 슬롯 web 포트(`pnpm wt:info`)·주소(시뮬레이터 localhost, 기기는 맥 LAN IP) 확인 → dev 서버 응답 확인 →
 * `vite build --mode development` (SEEDBOOK_API_BASE_URL = 그 주소, 개발용 빠른 로그인이 보인다) →
 * `cap sync` (SEEDBOOK_DEV_APP=1, OTA beta 채널 + 로컬 공개 키) → fastlane `dev` lane (iOS Dev 빌드 구성 /
 * Android dev 빌드 타입, 설치·실행).
 *
 * OTA: Dev 앱은 로컬 dev 서버의 `/api/app-bundle` 에서 beta 채널 번들을 받는다. 서명은 로컬 키 짝
 * (`~/.seedbook/ota-dev`, 없으면 만든다 — 운영 키가 아니다)으로 확인하고, 로컬 번들은
 *
 *   pnpm --filter @seedbook/mobile dev:ota-publish      # 지금 체크아웃 화면을 번들로 만들어 로컬 dev 서버 beta 에 올린다
 *
 * 로 올린다. 기기용 번들(맥 LAN IP 로 부르는)은 SEEDBOOK_DEV_HOST=<LAN IP> 를 준다 (기본 localhost = 시뮬레이터).
 *
 * 환경변수 (모두 선택): SEEDBOOK_DEV_HOST (LAN IP 대신 쓸 주소), SEEDBOOK_IOS_DEVICE (아이폰 UDID),
 * APPLE_TEAM_ID (없으면 키체인의 Apple Development 인증서에서), KAKAO_NATIVE_APP_KEY (없으면 .env.local).
 * Android 에뮬레이터는 띄우지 않는다.
 */
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, networkInterfaces, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createLocalOtaKeys,
  devAppApiBaseUrl,
  devAppOtaEnv,
  findSimulator,
  localOtaPaths,
  localPublishIds,
  parseWebPort,
  pickIosDevice,
  pickLanAddress,
  pickSimulatorTarget,
  readEnvValue,
  simulatorLimitError,
  simulatorName,
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

/** 로컬 OTA 키 짝·운영자 토큰 (없으면 만든다). 운영 서명 키는 로컬에 두지 않는다. */
function localOtaKeys() {
  const paths = localOtaPaths(env, homedir());
  if (
    !existsSync(paths.signingKey) ||
    !existsSync(paths.publicKey) ||
    !existsSync(paths.adminToken)
  ) {
    log(`로컬 OTA 키 짝·운영자 토큰을 만든다: ${paths.dir} (운영 키와 다른 로컬 전용 키)`);
    mkdirSync(paths.dir, { recursive: true, mode: 0o700 });
    const created = createLocalOtaKeys();
    writeFileSync(paths.signingKey, created.signingKey, { mode: 0o600 });
    writeFileSync(paths.publicKey, created.publicKey, { mode: 0o644 });
    writeFileSync(paths.adminToken, `${created.adminToken}\n`, { mode: 0o600 });
    chmodSync(paths.signingKey, 0o600);
    chmodSync(paths.adminToken, 0o600);
    log("dev 서버가 이미 떠 있으면 pnpm wt:stop 뒤 pnpm dev 로 다시 띄워야 로컬 publish 를 받는다");
  }
  return {
    signingKey: readFileSync(paths.signingKey, "utf8"),
    publicKey: readFileSync(paths.publicKey, "utf8"),
    adminToken: readFileSync(paths.adminToken, "utf8").trim(),
  };
}

/** 개발 빌드 (NODE_ENV=development 라 로그인 화면에 "개발용 빠른 로그인" 이 보인다). */
function viteDevBuild(baseUrl) {
  run("pnpm", ["exec", "vite", "build", "--mode", "development"], {
    env: { SEEDBOOK_API_BASE_URL: baseUrl, SEEDBOOK_APP_BUILD: `dev-${gitShortSha()}` },
  });
}

/** 지금 체크아웃 화면을 로컬 키로 서명해 로컬 dev 서버의 beta 채널에 올린다. */
function publishLocalBundle(baseUrl) {
  const keys = localOtaKeys();
  viteDevBuild(baseUrl);
  const sha = output("git", ["rev-parse", "HEAD"], { cwd: ROOT }).trim();
  const ids = localPublishIds(sha, Date.now());
  const published = spawnSync(
    "node",
    [
      path.join(ROOT, "scripts/app-bundle.mjs"),
      "publish",
      "--server",
      baseUrl,
      "--build",
      ids.build,
      "--run",
      ids.run,
    ],
    {
      cwd: ROOT,
      stdio: "inherit",
      env: {
        ...env,
        APP_BUNDLE_SIGNING_KEY: keys.signingKey,
        APP_BUNDLE_PUBLIC_KEY: keys.publicKey,
        APP_BUNDLE_ADMIN_TOKEN: keys.adminToken,
      },
    }
  );
  if (published.status !== 0) {
    fail(
      "올리지 못했다 — 404 면 dev 서버에 로컬 운영자 토큰이 없다: pnpm wt:stop 뒤 pnpm dev 로 다시 띄운다"
    );
  }
  log("Dev 앱을 백그라운드로 보냈다가 다시 열면 받고, 그 다음 실행 때 새 번들로 뜬다");
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

function simctlJson(...args) {
  return JSON.parse(output("xcrun", ["simctl", "list", ...args, "--json"]));
}

/**
 * 이 세션 전용 시뮬레이터를 (없으면 만들어) 창 없이 켠다 — 설치·실행·스크린샷은 simctl 로 한다.
 * 세션 시뮬레이터가 이미 최대 대수만큼 켜져 있으면 켜지 않고 실패한다 (`force` 면 넘어서 켠다).
 * `window` 면 Simulator 앱에 띄운다 (사람이 직접 눌러야 할 때).
 */
function sessionSimulator({ window = false, force = false } = {}) {
  const name = simulatorName(ROOT);
  const devices = simctlJson("devices");
  let simulator = findSimulator(devices, name);
  if (simulator?.state !== "Booted") {
    const limit = simulatorLimitError(devices, name);
    if (limit && !force) fail(limit);
    if (limit) log(`--force: ${limit.split(" — ")[0]} — 그래도 켠다`);
  }
  if (!simulator) {
    const { runtime, deviceType } = pickSimulatorTarget(simctlJson("runtimes"));
    log(
      `시뮬레이터 ${name} 를 만든다 (${deviceType.split(".").pop()}, ${runtime.split(".").pop()})`
    );
    const udid = output("xcrun", ["simctl", "create", name, deviceType, runtime]).trim();
    simulator = { udid, state: "Shutdown" };
  }
  if (simulator.state !== "Booted") run("xcrun", ["simctl", "boot", simulator.udid]);
  if (window) {
    const shown = spawnSync(
      "open",
      ["-b", "com.apple.iphonesimulator", "--args", "-CurrentDeviceUDID", simulator.udid],
      { stdio: "ignore" }
    );
    if (shown.status !== 0)
      log("Simulator 앱을 찾지 못해 창 없이 켜 두었다 (Xcode → Settings → Components)");
  }
  log(
    `시뮬레이터: ${name} (${simulator.udid}, ${window ? "Simulator 창" : "창 없음 — 화면은 xcrun simctl io <이름> screenshot <파일>.png, 직접 누르려면 dev:ios-sim:show"})`
  );
  return simulator.udid;
}

function stopSessionSimulator() {
  const name = simulatorName(ROOT);
  const simulator = findSimulator(simctlJson("devices"), name);
  if (simulator?.state !== "Booted") {
    log(`${name} 은 꺼져 있다`);
    return;
  }
  run("xcrun", ["simctl", "shutdown", simulator.udid]);
  log(`${name} 을 껐다`);
}

const PLATFORMS = ["ios-sim", "ios-sim-show", "ios-sim-stop", "ios", "android", "ota-publish"];

async function main() {
  const platform = process.argv[2];
  const flags = new Set(process.argv.slice(3));
  const simulatorOptions = { window: flags.has("--window"), force: flags.has("--force") };
  if (!PLATFORMS.includes(platform))
    fail(`usage: dev-app.mjs <${PLATFORMS.join("|")}> [--window] [--force]`);
  if (platform === "ios-sim-stop") return stopSessionSimulator();
  if (platform === "ios-sim-show") {
    sessionSimulator({ ...simulatorOptions, window: true });
    return;
  }

  const port = slotWebPort();
  const host =
    env.SEEDBOOK_DEV_HOST?.trim() ||
    (platform === "ios-sim" || platform === "ota-publish"
      ? "localhost"
      : pickLanAddress(networkInterfaces()));
  if (!host) fail("맥의 LAN IP 를 찾지 못했다 — Wi-Fi 에 연결하거나 SEEDBOOK_DEV_HOST 를 준다");
  const baseUrl = devAppApiBaseUrl({ host, port });
  await assertDevServer(baseUrl);
  if (platform === "ota-publish") return publishLocalBundle(baseUrl);
  log(`Seedbook Dev → ${baseUrl} (이 체크아웃의 dev 서버·슬롯 DB, OTA beta 채널)`);

  const otaKeys = localOtaKeys();
  viteDevBuild(baseUrl);
  const nativePlatform = platform === "android" ? "android" : "ios";
  run("pnpm", ["exec", "cap", "sync", nativePlatform], {
    env: { SEEDBOOK_DEV_APP: "1", ...devAppOtaEnv(otaKeys.publicKey) },
  });

  ensureBundle();
  const kakaoKey = kakaoNativeAppKey();
  if (platform === "ios-sim") {
    run("bundle", ["exec", "fastlane", "ios", "dev_sim"], {
      env: {
        SEEDBOOK_IOS_SIMULATOR: sessionSimulator(simulatorOptions),
        KAKAO_NATIVE_APP_KEY: kakaoKey,
      },
    });
    log("QA 가 끝나면 pnpm --filter @seedbook/mobile dev:ios-sim:stop 으로 시뮬레이터를 끈다");
  } else if (platform === "ios") {
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
    "설치했다. 출시 빌드로 돌아갈 때는 env 없이 pnpm --filter @seedbook/mobile sync 로 번들을 다시 넣는다 (OTA 공개 키·채널도 빠진다)"
  );
}

await main();
