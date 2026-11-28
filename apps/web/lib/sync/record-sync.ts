"use client";

import { accountFetch, accountStorage } from "@web/lib/account-storage";
import { onBeforeFlush } from "@web/lib/device-storage";
import { APP_BUILD } from "@web/lib/native/device-db/app-build";
import { getStorageMode } from "@web/lib/storage-mode";
import { clearEntitySyncState } from "./managed-stores";
import type { DeviceRecordStore } from "./v2/device-record-store";
import { createSyncEngine, type SyncEngine, type SyncStatus } from "./v2/engine";
import { adoptV1Outbox } from "./v2/legacy-v1";
import { createRecordLayer, type RecordLayer, SYNC_STATE_KEY } from "./v2/record-layer";
import { RECORD_STORE_KEYS } from "./v2/store-records";

/**
 * 이 앱에서 동기화 v2 (`lib/sync/v2`) 를 쓰는 접점 — 계정 자리의 기기 레코드 저장소, `accountFetch`,
 * 저장소 모드를 엔진에 넘긴다. 엔진·레코드 계층 자체는 프레임워크와 무관하다.
 */

let layer: RecordLayer | null = null;
let engine: SyncEngine | null = null;
const statusListeners = new Set<(status: SyncStatus) => void>();

/** 로그인하지 않았거나 자리가 닫혔을 때 — 읽기는 비어 있고 쓰기는 버린다 (`accountStorage` 와 같다). */
const NO_ACCOUNT_STORE: DeviceRecordStore = {
  load: async () => new Map(),
  apply: async () => ({ quarantined: [] }),
  everStored: async () => false,
};

export function getRecordLayer(): RecordLayer {
  layer ??= createRecordLayer({
    store: () => accountStorage.recordStore() ?? NO_ACCOUNT_STORE,
    kv: {
      getItem: accountStorage.getItem,
      setItem: accountStorage.setItem,
      removeItem: accountStorage.removeItem,
    },
    legacyEnvelope: (key) => accountStorage.readEnvelope(key),
    isCloud: () => getStorageMode() === "cloud",
  });
  onBeforeFlush(layer.idle);
  return layer;
}

export function getSyncEngine(): SyncEngine {
  if (!engine) {
    const records = getRecordLayer();
    engine = createSyncEngine({
      layer: records,
      fetchFn: accountFetch,
      client: APP_BUILD,
      onStatus: (status) => statusListeners.forEach((listener) => listener(status)),
    });
    const created = engine;
    records.onQuarantine(() => created.emitStatus());
  }
  return engine;
}

export function onSyncStatus(listener: (status: SyncStatus) => void): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

/** 옛 store envelope 를 모두 레코드로 옮긴다 (처음 한 번). */
export async function ensureRecordsImported(): Promise<void> {
  const records = getRecordLayer();
  for (const key of RECORD_STORE_KEYS) await records.readStore(key);
}

let initial: Promise<void> | null = null;

/** 첫 화면을 그리기 전에 기다리는 최대 시간 — 넘으면 기기 레코드로 그리고 동기화는 이어서 한다. */
const INITIAL_SYNC_WAIT_MS = 8_000;

/**
 * cloud 모드에서 store 를 처음 읽기 전에 한 번 동기화한다 (새 기기·오래 쉰 기기도 첫 화면이 서버와
 * 맞는다). v1 에서 처음 넘어온 기기면 v1 이 보내지 못한 변경을 먼저 옮긴다. 오래 걸리면 기다리지 않는다.
 */
export function initialCloudSync(): Promise<void> {
  initial ??= (async () => {
    await ensureRecordsImported();
    if (accountStorage.getItem(SYNC_STATE_KEY) === null) {
      await adoptV1Outbox(getRecordLayer(), accountStorage.getItem);
      clearEntitySyncState();
    }
    const sync = getSyncEngine().sync();
    await Promise.race([sync, new Promise((resolve) => setTimeout(resolve, INITIAL_SYNC_WAIT_MS))]);
  })().catch((error: unknown) => {
    console.warn("[sync] 첫 동기화 실패 — 기기 레코드로 시작한다", error);
  });
  return initial;
}
