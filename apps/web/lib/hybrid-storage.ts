"use client";

// side-effect import: 레거시 number ID 를 UUID 로 일회성 업그레이드한다.
// 이 import 가 store 파일보다 앞서 실행되도록 hybrid-storage 가 소유한다.
import "./local-id-upgrade";
import type { StateStorage } from "zustand/middleware";
import { type EnvelopeStore, getLocalEnvelopeStore } from "./local-envelope-store";
import { getStorageMode } from "./storage-mode";
import { loadManagedStoreFromServer } from "./sync/initial-load";
import { recordPersistedChange } from "./sync/local-change-recorder";
import { getManagedStoreConfig } from "./sync/managed-stores";

/**
 * 하이브리드 저장소 어댑터 — Zustand persist 미들웨어의 `StateStorage`.
 *
 *   - `local` 모드: 이 기기의 envelope 저장소에 읽고 쓴다 (`local-envelope-store.ts` —
 *     브라우저는 localStorage 동기, 네이티브 앱은 SQLite 비동기).
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

/** 이 기기의 envelope 저장소 — 브라우저는 localStorage, 네이티브 앱은 SQLite. */
function envelopes(): EnvelopeStore {
  return getLocalEnvelopeStore();
}

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
  if (!managed) {
    return {
      getItem: (name) => envelopes().getItem(name),
      setItem: (name, value) => envelopes().setItem(name, value),
      removeItem: (name) => envelopes().removeItem(name),
    };
  }

  let lastPersisted: string | null = null;
  return {
    getItem: async (name) => {
      const cached = await envelopes().getItem(name || key);
      const fromServer = await loadManagedStoreFromServer(managed, cached);
      lastPersisted = fromServer ?? cached;
      if (fromServer !== null) await envelopes().setItem(name || key, fromServer);
      return lastPersisted;
    },
    setItem: (name, value) => {
      const previous = lastPersisted ?? envelopes().getItem(name || key);
      lastPersisted = value;
      // 브라우저는 동기로 끝난다. 네이티브 앱(SQLite)에서 직전 저장본을 아직 모를 때만 기다린다.
      if (!(previous instanceof Promise)) {
        recordPersistedChange(managed, previous, value);
        return envelopes().setItem(name || key, value);
      }
      return previous.then((cached) => {
        recordPersistedChange(managed, cached, value);
        return envelopes().setItem(name || key, value);
      });
    },
    removeItem: (name) => envelopes().removeItem(name || key),
  };
}
