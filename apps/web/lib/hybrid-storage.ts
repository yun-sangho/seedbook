"use client";

// side-effect import: 레거시 number ID 를 UUID 로 일회성 업그레이드한다.
// 이 import 가 store 파일보다 앞서 실행되도록 hybrid-storage 가 소유한다.
import "./local-id-upgrade";

import { useSyncStatusStore } from "@web/features/settings/stores/sync-status-store";
import type { StateStorage } from "zustand/middleware";
import { getStorageMode } from "./storage-mode";

/**
 * 하이브리드 저장소 어댑터.
 *
 * Zustand persist 미들웨어의 `StateStorage` 를 구현하며, 모드에 따라 동작이
 * 갈린다:
 *
 *   - `local` 모드: 평소처럼 localStorage 에 동기적으로 읽고 쓴다. 현재 앱의
 *     모든 동작과 완전히 동일.
 *
 *   - `cloud` 모드:
 *       · `getItem` → `GET /api/storage/[key]` 를 호출해 envelope 문자열을
 *         돌려준다. 네트워크 실패 시 localStorage 캐시로 폴백. 401 은
 *         **강제 로그인** 시그널이라 sync-status 를 `unauthenticated` 로 바꾸고
 *         cache 를 돌려준다 (HydrationGate 가 이를 보고 로그인 화면으로 보냄).
 *       · `setItem` → 먼저 localStorage 에 **동기적으로** 쓰고 (1 프레임의
 *         데이터 유실도 막음), 같은 key 에 대해 1 초 debounced `PUT` 을 enqueue.
 *       · `removeItem` → localStorage 를 비우고 `PUT { data: null }` enqueue.
 *
 * 설계 결정:
 *   - 모드는 **모듈 초기화 시점에 한 번만** 읽는다. 런타임 전환은 페이지
 *     리로드로 강제한다 — race condition 을 전부 걷어내기 위해.
 *   - 어댑터는 persist 가 내보낸 문자열을 opaque 로 다룬다. `{ state, version }`
 *     구조는 파싱/직렬화 경계(API 라우트) 에서만 JSON 으로 전환한다.
 *   - 각 store 가 `createHybridStorage(key)` 로 자기만의 인스턴스를 받아야
 *     `beforeunload` 플러시가 정확히 어떤 key 를 가리키는지 알 수 있다.
 */

const DEBOUNCE_MS = 1000;
const LOGIN_REDIRECT_PATH = "/api/auth/sign-in/social?provider=kakao";

type PendingFlush = {
  value: string;
  timer: ReturnType<typeof setTimeout>;
};

// 모듈-레벨 싱글턴: 모든 어댑터 인스턴스가 공유하는 pending 큐.
// key → 마지막으로 디바운스된 값 + 타이머.
const pending = new Map<string, PendingFlush>();

// 첫 로드 이후에는 모드가 고정된다. 호출자가 `setStorageMode + reload` 하지 않는
// 한 같은 세션 안에선 이 값이 바뀌지 않는다.
const mode = typeof window === "undefined" ? "local" : getStorageMode();

function syncStatus() {
  // 직접 getState 로 접근 — 어댑터는 React 밖에서 불릴 수 있다.
  return useSyncStatusStore.getState();
}

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
    // quota / private mode — 무시하고 네트워크 PUT 에 맡긴다.
  }
}

function removeCache(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // noop
  }
}

async function cloudGet(key: string): Promise<string | null> {
  syncStatus().markSaving(key);
  try {
    const res = await fetch(`/api/storage/${encodeURIComponent(key)}`, {
      method: "GET",
      credentials: "include",
    });
    if (res.status === 401) {
      syncStatus().markUnauthenticated();
      // HydrationGate 가 세션 상태를 관찰해 로그인 화면으로 보낸다.
      // 폴백: 캐시가 있으면 그걸로 첫 페인트만이라도 보여준다.
      return readCache(key);
    }
    if (!res.ok) {
      syncStatus().markError(key, `GET ${key} ${res.status}`);
      return readCache(key);
    }
    const body = (await res.json()) as { data: unknown };
    syncStatus().markSaved(key);
    if (body.data === null || body.data === undefined) {
      // 서버에 아직 데이터가 없는 경우 — persist 가 빈 상태로 출발하도록 null.
      return null;
    }
    const serialized = JSON.stringify(body.data);
    writeCache(key, serialized);
    return serialized;
  } catch {
    // 네트워크 실패 — offline 상태로 표시하고 캐시로 fallback.
    syncStatus().markOffline(key);
    return readCache(key);
  }
}

async function cloudPut(key: string, value: string | null): Promise<void> {
  syncStatus().markSaving(key);
  try {
    const parsed = value === null ? null : JSON.parse(value);
    const res = await fetch(`/api/storage/${encodeURIComponent(key)}`, {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: parsed }),
    });
    if (res.status === 401) {
      syncStatus().markUnauthenticated();
      return;
    }
    if (!res.ok) {
      syncStatus().markError(key, `PUT ${key} ${res.status}`);
      return;
    }
    syncStatus().markSaved(key);
  } catch {
    syncStatus().markOffline(key);
  }
}

function enqueueCloudPut(key: string, value: string): void {
  const existing = pending.get(key);
  if (existing) clearTimeout(existing.timer);
  const timer = setTimeout(() => {
    pending.delete(key);
    void cloudPut(key, value);
  }, DEBOUNCE_MS);
  pending.set(key, { value, timer });
}

/**
 * `beforeunload` 훅 — pending 큐에 남은 put 을 `keepalive: true` 로 마지막으로
 * 시도한다. fetch 실패는 용납. 이 핸들러는 cloud 모드에서만 의미가 있다.
 */
function installBeforeUnloadFlush(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeunload", () => {
    pending.forEach((flush, key) => {
      clearTimeout(flush.timer);
      try {
        const parsed = JSON.parse(flush.value);
        void fetch(`/api/storage/${encodeURIComponent(key)}`, {
          method: "PUT",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ data: parsed }),
          keepalive: true,
        });
      } catch {
        // noop
      }
    });
    pending.clear();
  });
}

if (mode === "cloud") {
  installBeforeUnloadFlush();
}

/**
 * 특정 store key 에 묶인 `StateStorage` 인스턴스를 만든다.
 *
 * 사용법 (각 store 파일에서):
 * ```ts
 * persist(..., {
 *   name: "investment-storage",
 *   storage: createJSONStorage(() => createHybridStorage("investment-storage")),
 *   // ... partialize / migrate / onRehydrateStorage 는 그대로
 * })
 * ```
 */
export function createHybridStorage(key: string): StateStorage {
  if (mode === "local") {
    // local 모드는 현재 동작과 완전히 동일.
    return {
      getItem: (name) => {
        try {
          return window.localStorage.getItem(name);
        } catch {
          return null;
        }
      },
      setItem: (name, value) => {
        try {
          window.localStorage.setItem(name, value);
        } catch {
          // quota / private mode — 조용히 무시
        }
      },
      removeItem: (name) => {
        try {
          window.localStorage.removeItem(name);
        } catch {
          // noop
        }
      },
    };
  }

  // cloud 모드
  return {
    getItem: async (name) => {
      // Zustand 는 store 이름 (`investment-storage`) 을 그대로 name 에 넘기므로
      // key 와 일치한다. 방어적으로 key 를 선호한다.
      return cloudGet(name || key);
    },
    setItem: (name, value) => {
      writeCache(name || key, value);
      enqueueCloudPut(name || key, value);
    },
    removeItem: (name) => {
      removeCache(name || key);
      enqueueCloudPut(name || key, JSON.stringify(null));
    },
  };
}

/**
 * 테스트 전용: 전역 pending 큐를 비우고, 필요하면 mode 를 다시 읽을 수 있도록
 * 재설정한다.
 */
export function __resetHybridStorageForTests(): void {
  pending.forEach((p) => clearTimeout(p.timer));
  pending.clear();
}

export { DEBOUNCE_MS as HYBRID_STORAGE_DEBOUNCE_MS, LOGIN_REDIRECT_PATH };
