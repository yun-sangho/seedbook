import type { EntityData } from "./entity-sync-core";

/**
 * 엔티티 동기화로 관리되는 persist store 하나의 설정.
 *
 * cloud 모드에서 이 store 는 envelope (`/api/storage`) 대신 `/api/sync/*` 로 동기화되고,
 * persist storage 는 오프라인용 로컬 캐시만 맡는다.
 */
export type ManagedStoreConfig<T extends { id: string }> = {
  /** Zustand persist `name` (= localStorage 캐시 key). */
  storageKey: string;
  /** `/api/sync/mutations` 의 entity 이름. */
  entity: string;
  /** `user_list_order.domain`. */
  listOrderDomain: string;
  /** SyncMeta 를 두는 localStorage key. */
  metaKey: string;
  /** store 의 persist `version` — 서버에서 만든 상태를 이 버전으로 내보낸다. */
  persistVersion: number;
  /** persist state 안에서 목록이 들어 있는 필드 이름. */
  itemsField: string;
  /**
   * 저장 전 값 정리 (`normalize-values.ts` 규칙). NaN·범위 밖 값을 서버 검증이 받는 값으로 바꾸고,
   * 모르는 필드는 그대로 둔다. 모든 저장소 모드에서 persist 저장 앞에 돈다 (`hybrid-storage.ts`).
   */
  normalizeItem: (item: T) => T;
  /** 전송 형식. `normalizeItem` 과 같은 규칙으로 정리한 값을 보낸다. */
  toData: (item: T) => EntityData;
  fromData: (id: string, data: EntityData) => T;
};
