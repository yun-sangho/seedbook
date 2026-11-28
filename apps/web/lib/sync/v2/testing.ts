import { createKvRecordStore, type KeyValue } from "./device-record-store";
import { createRecordLayer, type RecordLayerDeps } from "./record-layer";

/** 테스트용 계정 자리 (메모리 키-값). */
export function memoryKv(): KeyValue & {
  removeItem(key: string): void;
  data: Map<string, string>;
} {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

/** 테스트용 기기 하나 (브라우저와 같은 키-값 레코드 저장소). */
export function memoryDevice(options: Partial<RecordLayerDeps> & { cloud?: boolean } = {}) {
  const kv = memoryKv();
  let cloud = options.cloud ?? true;
  const store = createKvRecordStore(kv, "seedbook.records");
  const layer = createRecordLayer({
    store: () => store,
    kv,
    isCloud: () => cloud,
    ...options,
  });
  return {
    kv,
    layer,
    setCloud: (value: boolean) => {
      cloud = value;
    },
  };
}
