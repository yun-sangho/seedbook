"use client";

// side-effect import: 레거시 number ID 를 UUID 로 일회성 업그레이드한다 (브라우저 데이터만).
// 이 import 가 store 파일보다 앞서 실행되도록 hybrid-storage 가 소유한다.
import "./local-id-upgrade";
import type { StateStorage } from "zustand/middleware";
import { accountStorage, afterAccountReady } from "./account-storage";
import { getStorageMode, type StorageMode } from "./storage-mode";
import { loadManagedStoreFromServer } from "./sync/initial-load";
import { recordPersistedChange } from "./sync/local-change-recorder";
import { getManagedStoreConfig } from "./sync/managed-stores";
import { normalizePersistedEnvelope } from "./sync/normalize-envelope";

/**
 * 하이브리드 저장소 어댑터 — Zustand persist 미들웨어의 `StateStorage`.
 *
 *   - `local` 모드: 이 기기 저장소(`device-storage.ts` — 브라우저는 localStorage, 네이티브 앱은
 *     서버와 같은 모양의 SQLite 테이블)에 읽고 쓴다.
 *
 *   - `cloud` 모드: persist storage 는 로컬 캐시만 맡고, 서버와는 엔티티 동기화로 주고받는다
 *     (`lib/sync/managed-stores.ts` 에 등록된 store).
 *       · `getItem` → 서버 전체 pull 로 상태를 만든다 (실패하면 로컬 캐시).
 *       · `setItem` → 캐시에 쓰고, 직전 저장본과 비교해 바뀐 항목을 동기화 대기열에 기록한다.
 *         엔진이 돌고 있지 않아도(로그인 확인 전, 세션 조회 실패) 수정이 사라지지 않는다.
 *         전송은 `EntitySyncRunner` 가 맡는다.
 *
 * 두 모드 모두 저장 전과 읽은 뒤에 목록 항목의 값을 정리한다 (`normalizePersistedEnvelope` —
 * NaN·범위 밖 값). 읽을 때도 정리해 이 규칙이 생기기 전에 저장된 값도 화면에 들어가기 전에 고친다.
 *
 * 모드는 **처음 쓸 때 한 번만** 읽고 고정한다. 런타임 전환은 페이지 리로드로 강제한다.
 * 로그인 사용자가 정해진 뒤에야 그 계정의 모드를 알 수 있어 모듈 초기화 시점에는 읽지 않는다
 * (`account-storage.ts`, 로그아웃 상태면 읽기는 비어 있고 쓰기는 버린다).
 */

let mode: StorageMode | null = null;

function currentMode(): StorageMode {
  mode ??= typeof window === "undefined" ? "local" : getStorageMode();
  return mode;
}

function normalizeRead(key: string, value: string | null): string | null {
  return value === null ? null : normalizePersistedEnvelope(key, value);
}

function createModeStorage(key: string): StateStorage {
  const store = accountStorage;
  const managed = currentMode() === "cloud" ? getManagedStoreConfig(key) : null;
  // local 모드 — 또는 동기화 설정이 없는 store 는 이 기기에만 저장한다.
  if (!managed) {
    return {
      getItem: (name) => {
        const value = store.readEnvelope(name);
        return value instanceof Promise
          ? value.then((v) => normalizeRead(key, v))
          : normalizeRead(key, value);
      },
      setItem: (name, value) => store.writeEnvelope(name, normalizePersistedEnvelope(key, value)),
      removeItem: (name) => store.removeEnvelope(name),
    };
  }

  let lastPersisted: string | null = null;
  return {
    getItem: async (name) => {
      const cached = normalizeRead(key, await store.readEnvelope(name || key));
      const fromServer = await loadManagedStoreFromServer(managed, cached);
      lastPersisted = fromServer ?? cached;
      if (fromServer !== null) await store.writeEnvelope(name || key, fromServer);
      return lastPersisted;
    },
    setItem: (name, raw) => {
      const value = normalizePersistedEnvelope(key, raw);
      const previous = lastPersisted ?? store.readEnvelope(name || key);
      lastPersisted = value;
      // 브라우저는 동기로 끝난다. 네이티브 앱(SQLite)에서 직전 저장본을 아직 모를 때만 기다린다.
      if (!(previous instanceof Promise)) {
        recordPersistedChange(managed, previous, value);
        return store.writeEnvelope(name || key, value);
      }
      return previous.then((cached) => {
        recordPersistedChange(managed, cached, value);
        return store.writeEnvelope(name || key, value);
      });
    },
    removeItem: (name) => store.removeEnvelope(name || key),
  };
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
  let inner: StateStorage | null = null;
  const resolve = () => {
    inner ??= createModeStorage(key);
    return inner;
  };
  return {
    getItem: (name) => afterAccountReady<string | null>(() => resolve().getItem(name)),
    setItem: (name, value) => afterAccountReady(() => resolve().setItem(name, value)),
    removeItem: (name) => afterAccountReady(() => resolve().removeItem(name)),
  };
}
