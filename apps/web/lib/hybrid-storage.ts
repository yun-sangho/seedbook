"use client";

// side-effect import: 레거시 number ID 를 UUID 로 일회성 업그레이드한다.
// 이 import 가 store 파일보다 앞서 실행되도록 hybrid-storage 가 소유한다.
import "./local-id-upgrade";
import type { StateStorage } from "zustand/middleware";
import { getStorageMode } from "./storage-mode";
import { loadManagedStoreFromServer } from "./sync/initial-load";
import { recordPersistedChange } from "./sync/local-change-recorder";
import { getManagedStoreConfig } from "./sync/managed-stores";

/**
 * 하이브리드 저장소 어댑터 — Zustand persist 미들웨어의 `StateStorage`.
 *
 *   - `local` 모드: localStorage 에 동기적으로 읽고 쓴다.
 *
 *   - `cloud` 모드: persist storage 는 로컬 캐시만 맡고, 서버와는 엔티티 동기화로 주고받는다
 *     (`lib/sync/managed-stores.ts` 에 등록된 store).
 *       · `getItem` → 서버 전체 pull 로 상태를 만든다 (실패하면 로컬 캐시).
 *       · `setItem` → 캐시에 쓰고, 직전 저장본과 비교해 바뀐 항목을 동기화 대기열에 기록한다.
 *         엔진이 돌고 있지 않아도(로그인 확인 전, 세션 조회 실패) 수정이 사라지지 않는다.
 *         전송은 `EntitySyncRunner` 가 맡는다.
 *
 * 모드는 **모듈 초기화 시점에 한 번만** 읽는다. 런타임 전환은 페이지 리로드로 강제한다.
 */

// 첫 로드 이후에는 모드가 고정된다. 호출자가 `setStorageMode + reload` 하지 않는
// 한 같은 세션 안에선 이 값이 바뀌지 않는다.
const mode = typeof window === "undefined" ? "local" : getStorageMode();

function readCache(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeCache(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // quota / private mode — 조용히 무시
  }
}

function removeCache(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // noop
  }
}

const localStorageAdapter: StateStorage = {
  getItem: (name) => readCache(name),
  setItem: (name, value) => writeCache(name, value),
  removeItem: (name) => removeCache(name),
};

/**
 * 특정 store key 에 묶인 `StateStorage` 인스턴스를 만든다.
 *
 * 사용법 (각 store 파일에서):
 * ```ts
 * persist(..., {
 *   name: "investment-storage",
 *   storage: createJSONStorage(() => createHybridStorage("investment-storage")),
 * })
 * ```
 */
export function createHybridStorage(key: string): StateStorage {
  const managed = mode === "cloud" ? getManagedStoreConfig(key) : null;
  // local 모드 — 또는 동기화 설정이 없는 store 는 이 브라우저에만 저장한다.
  if (!managed) return localStorageAdapter;

  let lastPersisted: string | null = null;
  return {
    getItem: async (name) => {
      const cached = readCache(name || key);
      const fromServer = await loadManagedStoreFromServer(managed, cached);
      lastPersisted = fromServer ?? cached;
      if (fromServer !== null) writeCache(name || key, fromServer);
      return lastPersisted;
    },
    setItem: (name, value) => {
      recordPersistedChange(managed, lastPersisted ?? readCache(name || key), value);
      lastPersisted = value;
      writeCache(name || key, value);
    },
    removeItem: (name) => removeCache(name || key),
  };
}
