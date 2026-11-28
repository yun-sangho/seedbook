/**
 * 개발용 앱 Seedbook Dev 설치 스크립트(scripts/dev-app.mjs)의 순수 로직. 테스트:
 * apps/web/test/dev-app/dev-app-lib.test.ts
 */

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
