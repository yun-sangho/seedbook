/**
 * 개발용 앱 Seedbook Dev 설치 스크립트(scripts/dev-app.mjs)의 순수 로직. 테스트:
 * apps/web/test/dev-app/dev-app-lib.test.ts
 */

import { generateKeyPairSync, randomBytes } from "node:crypto";

/** VPN·가상 브리지·Docker 등 기기가 닿지 않는 인터페이스. */
const SKIPPED_INTERFACE = /^(lo|utun|bridge|vmenet|awdl|llw|anpi|ap\d|gif|stf|docker|veth)/;

/**
 * 같은 Wi-Fi 의 기기가 맥에 닿는 IPv4 주소. en0(맥 Wi-Fi)을 먼저 보고, 없으면 다른 물리 인터페이스의
 * 사설 주소를 쓴다. 없으면 null.
 *
 * @param {Record<string, Array<{ address: string, family: string | number, internal: boolean }> | undefined>} interfaces
 *   `os.networkInterfaces()`
 */
export function pickLanAddress(interfaces) {
  const usable = (name) =>
    (interfaces[name] ?? []).filter(
      (entry) =>
        (entry.family === "IPv4" || entry.family === 4) &&
        !entry.internal &&
        !entry.address.startsWith("169.254.")
    );
  const preferred = usable("en0");
  if (preferred.length > 0) return preferred[0].address;
  for (const name of Object.keys(interfaces).sort()) {
    if (name === "en0" || SKIPPED_INTERFACE.test(name)) continue;
    const found = usable(name);
    if (found.length > 0) return found[0].address;
  }
  return null;
}

/** `pnpm wt:info` (scripts/worktree.mjs info) 출력에서 슬롯 web 포트. */
export function parseWebPort(infoOutput) {
  const match = /^\s*web\s+http:\/\/localhost:(\d+)/m.exec(infoOutput);
  return match ? Number(match[1]) : null;
}

/** Dev 앱 번들이 부를 주소 = 맥의 슬롯 web 포트(앱 Vite, `/api` 를 Next 로 넘긴다). */
export function devAppApiBaseUrl({ host, port }) {
  return `http://${host}:${port}`;
}

/**
 * `xcrun devicectl list devices --json-output` 에서 설치할 아이폰 하나. 연결된 실기기가 없거나 여럿이면
 * 이유를 담아 throw 한다.
 */
export function pickIosDevice(listJson) {
  const devices = (listJson?.result?.devices ?? []).filter(
    (device) =>
      device.hardwareProperties?.platform === "iOS" &&
      device.hardwareProperties?.reality === "physical" &&
      device.connectionProperties?.tunnelState === "connected"
  );
  if (devices.length === 0) {
    throw new Error(
      "연결된 아이폰이 없다 — USB 나 같은 Wi-Fi 로 연결하고 Xcode 에서 페어링한다 (xcrun devicectl list devices)"
    );
  }
  if (devices.length > 1) {
    const names = devices
      .map((device) => `${device.deviceProperties?.name} (${device.hardwareProperties.udid})`)
      .join(", ");
    throw new Error(`연결된 아이폰이 여럿이다: ${names} — SEEDBOOK_IOS_DEVICE=<UDID> 로 고른다`);
  }
  const [device] = devices;
  return { udid: device.hardwareProperties.udid, name: device.deviceProperties?.name ?? "" };
}

/** `openssl x509 -noout -subject` 의 OU (= Apple 팀 ID). */
export function teamIdFromCertificateSubject(subject) {
  const match = /\bOU\s*=\s*([A-Z0-9]+)/.exec(subject);
  return match ? match[1] : null;
}

/** .env 형식 텍스트에서 key 의 값 (마지막 줄이 이긴다, 주석·따옴표 무시). 없거나 비면 null. */
export function readEnvValue(text, key) {
  let value = null;
  for (const line of text.split("\n")) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match || match[1] !== key) continue;
    value = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
  return value ? value : null;
}

/** 이 세션 전용 iOS 시뮬레이터 이름: `seedbook-<워크트리 폴더 이름>` (메인 체크아웃은 `seedbook-seedbook`). */
export function simulatorName(checkoutDir) {
  const base = checkoutDir.replace(/\/+$/, "").split("/").pop() ?? "";
  return `seedbook-${base}`;
}

/** `xcrun simctl list devices --json` 에서 이름이 같은 시뮬레이터 { udid, state }. 없으면 null. */
export function findSimulator(devicesJson, name) {
  for (const devices of Object.values(devicesJson?.devices ?? {})) {
    for (const device of devices) {
      if (device.name === name && device.isAvailable !== false) {
        return { udid: device.udid, state: device.state };
      }
    }
  }
  return null;
}

function versionKey(version) {
  return String(version)
    .split(".")
    .map((part) => Number(part) || 0);
}

function compareVersions(a, b) {
  const [x, y] = [versionKey(a), versionKey(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  }
  return 0;
}

/** `iPhone-SE-3rd-generation` → 3, `iPhone-SE--2nd-generation-` → 2, `iPhone-SE` → 1 */
function seGeneration(id) {
  const match = /iPhone-SE(?:-+(\d+)\w*-generation-?)?$/.exec(id);
  return match ? Number(match[1] ?? 1) : null;
}

/**
 * 새 시뮬레이터를 만들 런타임·기종 (`xcrun simctl list runtimes --json`). 가장 새 iOS 런타임 가운데 기종이
 * 가장 많은 것(특정 기종 전용 런타임은 뺀다). 기종은 가벼운 작은 화면: 가장 새 iPhone SE, 없으면 가장 새 mini,
 * 없으면 가장 오래된 기본 기종(`iPhone-<n>e` 먼저, 그다음 `iPhone-<n>`), 그마저 없으면 첫 iPhone.
 */
export function pickSimulatorTarget(runtimesJson) {
  const runtimes = (runtimesJson?.runtimes ?? []).filter(
    (runtime) => runtime.platform === "iOS" && runtime.isAvailable
  );
  runtimes.sort(
    (a, b) =>
      compareVersions(b.version, a.version) ||
      (b.supportedDeviceTypes?.length ?? 0) - (a.supportedDeviceTypes?.length ?? 0)
  );
  const runtime = runtimes[0];
  if (!runtime)
    throw new Error("설치된 iOS 시뮬레이터 런타임이 없다 — xcodebuild -downloadPlatform iOS");
  const iphones = (runtime.supportedDeviceTypes ?? [])
    .map((type) => type.identifier)
    .filter((id) => /SimDeviceType\.iPhone-/.test(id));
  const ranked = (score) =>
    iphones
      .map((id) => ({ id, score: score(id) }))
      .filter((entry) => entry.score !== null)
      .sort((a, b) => a.score - b.score)[0]?.id;
  const deviceType =
    ranked((id) => {
      const generation = seGeneration(id);
      return generation === null ? null : -generation;
    }) ??
    ranked((id) => {
      const match = /iPhone-(\d+)-mini$/.exec(id);
      return match ? -Number(match[1]) : null;
    }) ??
    ranked((id) => {
      const match = /iPhone-(\d+)(e?)$/.exec(id);
      return match ? Number(match[1]) * 2 + (match[2] ? 0 : 1) : null;
    }) ??
    iphones[0];
  if (!deviceType) throw new Error(`${runtime.identifier} 에 iPhone 기종이 없다`);
  return { runtime: runtime.identifier, deviceType };
}

/** 세션 시뮬레이터 이름의 머리 (`simulatorName`) */
const SESSION_SIMULATOR_PREFIX = "seedbook-";

/** 동시에 켜 둘 수 있는 세션 시뮬레이터 수. 하나가 iOS 데몬까지 수 GB 메모리를 쓴다. */
export const MAX_BOOTED_SIMULATORS = 2;

/** `xcrun simctl list devices --json` 에서 세션 시뮬레이터(`seedbook-*`) [{ name, udid, state }], 이름 순. */
export function sessionSimulators(devicesJson) {
  const found = [];
  for (const devices of Object.values(devicesJson?.devices ?? {})) {
    for (const device of devices) {
      if (device.isAvailable === false || !device.name?.startsWith(SESSION_SIMULATOR_PREFIX))
        continue;
      found.push({ name: device.name, udid: device.udid, state: device.state });
    }
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * 이 세션 시뮬레이터(`ownName`)를 켜면 세션 시뮬레이터가 `MAX_BOOTED_SIMULATORS` 를 넘는가. 넘으면 어떤 세션 것이
 * 켜져 있는지 담은 안내, 아니면 null. 이미 켜진 자기 것은 다시 써도 된다. 다른 세션 시뮬레이터는 끄지 않는다.
 */
export function simulatorLimitError(devicesJson, ownName, max = MAX_BOOTED_SIMULATORS) {
  const booted = sessionSimulators(devicesJson).filter((sim) => sim.state === "Booted");
  if (booted.some((sim) => sim.name === ownName) || booted.length < max) return null;
  return (
    `세션 시뮬레이터가 이미 ${booted.length}대 켜져 있다 (최대 ${max}대): ${booted.map((sim) => sim.name).join(", ")} — ` +
    "그 세션이 dev:ios-sim:stop 으로 끌 때까지 기다리거나, 꼭 지금 켜야 하면 --force 를 붙인다 (다른 세션 시뮬레이터는 끄지 않는다)"
  );
}

/**
 * 로컬 OTA 키 폴더: `SEEDBOOK_OTA_DEV_DIR`, 없으면 `~/.seedbook/ota-dev`. 레포 밖이고 모든 체크아웃(메인·워크트리)이
 * 같이 쓴다 — 로컬 dev 서버에 올린 번들을 어느 슬롯의 Dev 앱이든 받게.
 *
 * - `signing.pem`: 로컬 서명 개인 키 (2048비트 RSA, 0600). 로컬 publish 만 쓴다.
 * - `public.pem`: 그 공개 키. Dev 앱 빌드(`SEEDBOOK_OTA_PUBLIC_KEY`)에 들어간다.
 * - `admin-token`: 로컬 dev 서버의 운영자 API 토큰 (0600). `pnpm dev` 가 `APP_BUNDLE_ADMIN_TOKEN` 으로 넣는다.
 *
 * 운영 서명 키(비밀번호 관리자)와 다른 키다 — 운영 번들은 Dev 앱이 받지 않고, 로컬 번들은 출시 앱이 받지 않는다.
 */
export function localOtaPaths(env, homeDir) {
  const dir =
    env.SEEDBOOK_OTA_DEV_DIR?.trim() || `${homeDir.replace(/\/+$/, "")}/.seedbook/ota-dev`;
  return {
    dir,
    signingKey: `${dir}/signing.pem`,
    publicKey: `${dir}/public.pem`,
    adminToken: `${dir}/admin-token`,
  };
}

/** 로컬 OTA 키 짝과 운영자 토큰을 새로 만든다 (파일 쓰기는 부르는 쪽). */
export function createLocalOtaKeys() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { signingKey: privateKey, publicKey, adminToken: randomBytes(32).toString("hex") };
}

/** Dev 앱 `cap sync` 에 넣는 OTA 설정: beta 채널 + 로컬 공개 키 (`apps/mobile/capacitor.config.ts`). */
export function devAppOtaEnv(publicKeyPem) {
  return { SEEDBOOK_OTA_CHANNEL: "beta", SEEDBOOK_OTA_PUBLIC_KEY: publicKeyPem.trim() };
}

/**
 * 로컬 publish 의 번들 id 재료 (`scripts/app-bundle.mjs publish --build --run`): 커밋 sha 그대로, run 번호 대신
 * 초 단위 시각 — 같은 커밋을 여러 번 올려도 id 가 겹치지 않고, 나중에 올린 것이 더 큰 수다.
 */
export function localPublishIds(sha, nowMs) {
  return { build: sha, run: String(Math.floor(nowMs / 1000)) };
}
