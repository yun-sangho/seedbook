import type { DeviceSnapshotStore, SnapshotRow } from "../integrity";

/** 테스트용 스냅샷 보관소 (메모리). */
export function createMemorySnapshotStore(): DeviceSnapshotStore & {
  files: Map<string, SnapshotRow[]>;
} {
  const files = new Map<string, SnapshotRow[]>();
  return {
    files,
    list: async () => [...files.keys()],
    save: async (name, rows) => {
      files.set(name, structuredClone(rows));
    },
    read: async (name) => structuredClone(files.get(name) ?? []),
    remove: async (name) => {
      files.delete(name);
    },
  };
}
