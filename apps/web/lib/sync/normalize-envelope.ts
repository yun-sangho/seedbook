import { getManagedStoreConfig } from "./managed-stores";

/**
 * persist envelope (`{ state, version }`) 의 목록 항목을 저장 전에 정리한다 (`normalizeItem`).
 * 저장소 모드와 상관없이 같은 규칙이다 — 브라우저 local(localStorage), 앱 local(SQLite),
 * cloud 캐시 모두 이 값을 쓴다. 동기화 설정이 없는 store, envelope 가 아닌 값, store 의 지금
 * persist version 이 아닌 envelope (옛 모양 — store 의 `migrate` 가 먼저 돌아야 한다) 는 그대로 둔다.
 * 고칠 것이 없으면 받은 문자열을 그대로 돌려준다.
 */
export function normalizePersistedEnvelope(key: string, value: string): string {
  const config = getManagedStoreConfig(key);
  if (!config) return value;
  let envelope: { state?: Record<string, unknown>; version?: unknown } & Record<string, unknown>;
  try {
    envelope = JSON.parse(value);
  } catch {
    return value;
  }
  if (envelope?.version !== config.persistVersion) return value;
  const items = envelope.state?.[config.itemsField];
  if (!Array.isArray(items)) return value;

  const normalized = items.map((item) => config.normalizeItem(item));
  // 값이 같으면 원래 문자열을 그대로 둔다 (불필요한 재직렬화 차이를 만들지 않는다).
  if (JSON.stringify(normalized) === JSON.stringify(items)) return value;
  return JSON.stringify({
    ...envelope,
    state: { ...envelope.state, [config.itemsField]: normalized },
  });
}
