"use client";

// side-effect import: 레거시 number ID 를 UUID 로 일회성 업그레이드한다 (브라우저 데이터만).
// 이 import 가 store 파일보다 앞서 실행되도록 hybrid-storage 가 소유한다.
import "./local-id-upgrade";
import type { StateStorage } from "zustand/middleware";
import { accountStorage, afterAccountReady } from "./account-storage";
import { getStorageMode, type StorageMode } from "./storage-mode";
import { normalizePersistedEnvelope } from "./sync/normalize-envelope";
import { getRecordLayer, initialCloudSync } from "./sync/record-sync";
import { isRecordStoreKey, STORE_SHAPES } from "./sync/v2/store-records";

/**
 * 하이브리드 저장소 어댑터 — Zustand persist 미들웨어의 `StateStorage`.
 *
 * 자산 store (투자·포트폴리오·리밸런싱) 는 저장소 모드와 상관없이 **기기 레코드**에 둔다
 * (`lib/sync/v2`, 브라우저는 계정 자리의 키 하나에 JSON, 앱은 SQLite `records`):
 *   - `getItem` → 레코드를 store 모양으로 묶는다 (compose). 처음이면 옛 envelope 를 레코드로 옮긴다.
 *     cloud 모드면 처음 읽기 전에 한 번 동기화한다 (`initialCloudSync`).
 *   - `setItem` → 레코드로 나눠(decompose) 바뀐 레코드만 패치로 저장한다. cloud 모드면 실제로 바뀐
 *     필드를 outbox 에 기록한다 — 엔진이 돌고 있지 않아도(로그인 확인 전, 오프라인) 수정이 남는다.
 *     전송은 `RecordSyncRunner` 가 맡는다.
 * 그 밖의 store 는 이 기기 저장소의 envelope 그대로다.
 *
 * 두 경우 모두 저장 전과 읽은 뒤에 목록 항목의 값을 정리한다 (`normalizePersistedEnvelope` —
 * NaN·범위 밖 값).
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
  if (!isRecordStoreKey(key)) {
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

  const records = getRecordLayer();
  return {
    getItem: async () => {
      if (currentMode() === "cloud") await initialCloudSync();
      return normalizeRead(key, await records.readStore(key));
    },
    setItem: (_name, raw) => records.saveStore(key, normalizePersistedEnvelope(key, raw)),
    // 목록을 비운 것과 같다 (사용자가 모두 지움).
    removeItem: () =>
      records.saveStore(
        key,
        JSON.stringify({ state: { [STORE_SHAPES[key].listField]: [] }, version: 0 })
      ),
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
