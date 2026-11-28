import {
  type AppBundleChannel,
  type AppBundleOutcome,
  isAppBundleChannel,
  type LatestAppBundleResponse,
  NO_APP_BUNDLE,
  parseLatestAppBundleResponse,
} from "@seedbook/domain/app-bundle";
import { apiFetch, apiUrl } from "../api-client";
import { flushDeviceStorage, getDeviceStorage } from "../device-storage";
import { isBundledApp } from "./bundled-app";

/**
 * OTA 번들 업데이트 (`@capawesome/capacitor-live-update`, 서버 `GET /api/app-bundle/latest`). 번들 앱이
 * 시작할 때와 다시 앞으로 올 때 받을 번들을 묻고, 있으면 내려받아 체크섬·서명(앱에 내장한 공개 키,
 * `capacitor.config.ts`)을 확인한 뒤 **다음 실행 때** 그 번들로 뜨게 한다 — 쓰는 중인 화면을 바꾸지 않는다.
 *
 * - 새 번들이 뜨면 `markReady()` (`ready()`) 로 정상 부팅을 알린다. 제한 시간(`readyTimeout`) 안에 못
 *   알리면 플러그인이 내장 번들로 되돌린다 (자동 롤백). 결과(적용·롤백·검증 실패)는 서버에 보고하고,
 *   실패가 쌓이면 서버가 그 번들을 내린다.
 * - 번들을 바꾸기 전에 기기 저장소의 쓰기를 모두 저장하고(`flushDeviceStorage`) 기기 DB 스냅샷을 남긴다.
 *   저장하지 못하면 이번에는 바꾸지 않는다.
 * - 채널은 플러그인이 기억한다: 바이너리의 기본값(`defaultChannel`, 공개 키가 있는 빌드만 넣는다) 또는
 *   설정의 숨은 토글(`setChannel`). 채널이 없으면 OTA 를 쓰지 않는 바이너리다.
 */

/** 플러그인에서 쓰는 것만. */
export interface LiveUpdatePlugin {
  ready(): Promise<{
    previousBundleId: string | null;
    currentBundleId: string | null;
    rollback: boolean;
  }>;
  getChannel(): Promise<{ channel: string | null }>;
  setChannel(options: { channel: string | null }): Promise<void>;
  getCurrentBundle(): Promise<{ bundleId: string | null }>;
  getNextBundle(): Promise<{ bundleId: string | null }>;
  getBundles(): Promise<{ bundleIds: string[] }>;
  downloadBundle(options: {
    bundleId: string;
    url: string;
    checksum: string;
    signature: string;
    artifactType: "zip";
  }): Promise<void>;
  setNextBundle(options: { bundleId: string }): Promise<void>;
  reset(): Promise<void>;
}

export interface LatestQuery {
  native: string;
  channel: AppBundleChannel;
  current: string | null;
  device: string;
}

/** 기기 수준(계정과 상관없는) 작은 값 저장소 — 앱은 SQLite `device_kv`. */
export interface LiveUpdateState {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface LiveUpdateDeps {
  plugin: LiveUpdatePlugin;
  /** 바이너리 버전 (`App.getInfo().version`). */
  nativeVersion: () => Promise<string>;
  /** 이 번들을 만든 커밋 sha (`SEEDBOOK_APP_BUILD`). 내장 번들이 이미 그 빌드면 받지 않는다. */
  appBuild: string;
  state: LiveUpdateState;
  fetchLatest: (query: LatestQuery) => Promise<LatestAppBundleResponse>;
  report: (bundleId: string, installId: string, outcome: AppBundleOutcome) => Promise<void>;
  /** 번들을 바꾸기 전: 저장 대기열 비우기 + 스냅샷. 저장하지 못했으면 false. */
  prepareSwitch: () => Promise<boolean>;
  /** 번들 경로(`/api/app-bundle/files/…`) 에 API 서버 주소를 붙인다. */
  resolveUrl: (path: string) => string;
  randomId: () => string;
}

export const STATE_KEYS = {
  installId: "seedbook.ota.installId",
  /** 다음 실행 때 쓰도록 정한 번들 — 다음 `ready()` 에서 적용됐는지 본다. */
  pending: "seedbook.ota.pending",
  /** 이 기기에서 실패한 번들 (다시 받지 않는다). */
  failed: "seedbook.ota.failed",
} as const;

/** 실패한 번들을 기억하는 최대 수. */
const FAILED_TO_KEEP = 20;

export type CheckResult =
  | "disabled"
  | "none"
  | "current"
  | "blocked"
  | "pending"
  | "download_failed"
  | "verify_failed"
  | "deferred"
  | "scheduled"
  | "reset";

/** 플러그인이 내려받기 실패를 알리는 메시지 중 체크섬·서명 확인 실패. */
function isVerifyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /checksum|signature/i.test(message);
}

export function createLiveUpdate(deps: LiveUpdateDeps) {
  const { plugin, state } = deps;

  function installId(): string {
    const saved = state.getItem(STATE_KEYS.installId);
    if (saved) return saved;
    const id = deps.randomId();
    state.setItem(STATE_KEYS.installId, id);
    return id;
  }

  function failedBundles(): string[] {
    try {
      const parsed: unknown = JSON.parse(state.getItem(STATE_KEYS.failed) ?? "[]");
      return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
    } catch {
      return [];
    }
  }

  function rememberFailed(bundleId: string) {
    const failed = [...failedBundles().filter((id) => id !== bundleId), bundleId];
    state.setItem(STATE_KEYS.failed, JSON.stringify(failed.slice(-FAILED_TO_KEEP)));
  }

  function report(bundleId: string, outcome: AppBundleOutcome) {
    void deps.report(bundleId, installId(), outcome).catch(() => undefined);
  }

  /**
   * 앱이 정상으로 떴다고 플러그인에 알린다 (자동 롤백을 멈춘다). 지난번에 정해 둔 번들이 지금 쓰이면
   * "적용", 아니면(롤백됐으면) "롤백" 으로 보고한다. 어떤 번들 앱이든 시작마다 한 번 부른다.
   */
  async function markReady(): Promise<void> {
    const result = await plugin.ready();
    const pending = state.getItem(STATE_KEYS.pending);
    const rolledBack = result.rollback ? result.previousBundleId : null;
    if (pending) {
      state.removeItem(STATE_KEYS.pending);
      if (result.currentBundleId === pending) {
        report(pending, "applied");
      } else {
        rememberFailed(pending);
        report(pending, "rolled_back");
      }
    }
    if (rolledBack && rolledBack !== pending) {
      rememberFailed(rolledBack);
      report(rolledBack, "rolled_back");
    }
  }

  /** 채널. 플러그인에 채널이 없으면 OTA 를 쓰지 않는 바이너리 (공개 키 없이 빌드함). */
  async function channel(): Promise<AppBundleChannel | null> {
    const { channel } = await plugin.getChannel();
    return isAppBundleChannel(channel) ? channel : null;
  }

  /** 받을 번들을 확인하고, 있으면 내려받아 다음 실행 때 쓰도록 정한다. */
  async function check(): Promise<CheckResult> {
    const resolvedChannel = await channel();
    if (!resolvedChannel) return "disabled";
    const [native, { bundleId: current }] = await Promise.all([
      deps.nativeVersion(),
      plugin.getCurrentBundle(),
    ]);
    const latest = await deps.fetchLatest({
      native,
      channel: resolvedChannel,
      current,
      device: installId(),
    });

    if (!latest.bundle) {
      if (!latest.reset || !current) return "none";
      // 지금 번들이 내려졌다 — 다음 실행 때 내장 번들로.
      if (!(await deps.prepareSwitch())) return "deferred";
      await plugin.reset();
      return "reset";
    }

    const offer = latest.bundle;
    if (offer.id === current) return "current";
    if (current === null && offer.build === deps.appBuild) return "current";
    if (failedBundles().includes(offer.id)) return "blocked";
    const { bundleId: next } = await plugin.getNextBundle();
    if (next === offer.id) return "pending";

    const { bundleIds } = await plugin.getBundles();
    if (!bundleIds.includes(offer.id)) {
      try {
        await plugin.downloadBundle({
          bundleId: offer.id,
          url: deps.resolveUrl(offer.url),
          checksum: offer.checksum,
          signature: offer.signature,
          artifactType: "zip",
        });
      } catch (error) {
        const outcome = isVerifyError(error) ? "verify_failed" : "download_failed";
        console.warn(`[live-update] ${offer.id} 를 받지 못했다 (${outcome})`, error);
        if (outcome === "verify_failed") rememberFailed(offer.id);
        report(offer.id, outcome);
        return outcome;
      }
    }

    if (!(await deps.prepareSwitch())) return "deferred";
    await plugin.setNextBundle({ bundleId: offer.id });
    state.setItem(STATE_KEYS.pending, offer.id);
    return "scheduled";
  }

  let running: Promise<CheckResult> | null = null;

  /** 확인은 한 번에 하나만. 실패해도 던지지 않는다 — 업데이트가 앱을 멈추게 하지 않는다. */
  function checkOnce(): Promise<CheckResult> {
    running ??= check()
      .catch((error: unknown) => {
        console.warn("[live-update] 확인 실패", error);
        return "none" as const;
      })
      .finally(() => {
        running = null;
      });
    return running;
  }

  /** 숨은 설정: beta 채널을 켜고 끈다. OTA 를 쓰지 않는 바이너리면 아무것도 하지 않는다. */
  async function setChannel(next: AppBundleChannel): Promise<void> {
    if (!(await channel())) return;
    await plugin.setChannel({ channel: next });
  }

  return { markReady, channel, check: checkOnce, setChannel };
}

export type LiveUpdate = ReturnType<typeof createLiveUpdate>;

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  isPluginAvailable?: (name: string) => boolean;
}

export const LIVE_UPDATE_PLUGIN = "LiveUpdate";

/** 번들 앱이고 바이너리에 플러그인이 있는지 (플러그인이 없는 옛 바이너리는 아무것도 하지 않는다). */
export function isLiveUpdateAvailable(): boolean {
  if (!isBundledApp()) return false;
  const capacitor = (window as Window & { Capacitor?: CapacitorGlobal }).Capacitor;
  return capacitor?.isPluginAvailable?.(LIVE_UPDATE_PLUGIN) === true;
}

async function fetchLatest(query: LatestQuery): Promise<LatestAppBundleResponse> {
  const params = new URLSearchParams({
    native: query.native,
    channel: query.channel,
    device: query.device,
  });
  if (query.current) params.set("current", query.current);
  const response = await apiFetch(`/api/app-bundle/latest?${params}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return NO_APP_BUNDLE;
  return parseLatestAppBundleResponse(await response.json());
}

async function sendReport(bundleId: string, installId: string, outcome: AppBundleOutcome) {
  await apiFetch("/api/app-bundle/reports", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ bundleId, installId, outcome }),
    signal: AbortSignal.timeout(10_000),
  });
}

async function prepareSwitch(): Promise<boolean> {
  if (!(await flushDeviceStorage())) return false;
  try {
    await getDeviceStorage().snapshot("update");
  } catch (error) {
    // 스냅샷이 없어도 번들은 바꾼다 — 매일 스냅샷과 기기 레코드 이력이 남아 있다.
    console.warn("[live-update] 번들 교체 전 스냅샷 실패", error);
  }
  return true;
}

let instance: Promise<LiveUpdate | null> | null = null;

/** 번들 앱의 OTA. 플러그인이 없으면 null. */
export function getLiveUpdate(): Promise<LiveUpdate | null> {
  if (!isLiveUpdateAvailable()) return Promise.resolve(null);
  instance ??= (async () => {
    const [{ LiveUpdate }, { App }] = await Promise.all([
      import("@capawesome/capacitor-live-update"),
      import("@capacitor/app"),
    ]);
    const storage = getDeviceStorage();
    await storage.whenReady();
    return createLiveUpdate({
      plugin: LiveUpdate,
      nativeVersion: async () => (await App.getInfo()).version,
      appBuild: process.env.SEEDBOOK_APP_BUILD ?? "",
      state: storage,
      fetchLatest,
      report: sendReport,
      prepareSwitch,
      resolveUrl: apiUrl,
      randomId: () => crypto.randomUUID(),
    });
  })().catch((error: unknown) => {
    console.warn("[live-update] 플러그인을 불러오지 못했다", error);
    return null;
  });
  return instance;
}
