import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { RECORDS } from "../src/records";
import { createSnapshot, type SchemaSnapshot, SNAPSHOT_FORMAT } from "../src/snapshot";
import { MIN_SCHEMA, SCHEMA_VERSION } from "../src/version";

export const SNAPSHOT_DIR = join(import.meta.dirname, "..", "schema-snapshots");

const FILE_PATTERN = /^v(\d+)\.json$/;

export const snapshotFileName = (version: number) => `v${version}.json`;

/** 지금 정의의 스냅샷. */
export function currentSnapshot(): SchemaSnapshot {
  return createSnapshot(RECORDS, { schemaVersion: SCHEMA_VERSION, minSchema: MIN_SCHEMA });
}

/** 커밋된 출시 스냅샷들. 파일 이름의 버전과 내용의 버전이 다르면 실패한다. */
export function readReleasedSnapshots(dir = SNAPSHOT_DIR): SchemaSnapshot[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((name) => FILE_PATTERN.test(name))
    .map((name) => {
      const snapshot = JSON.parse(readFileSync(join(dir, name), "utf8")) as SchemaSnapshot;
      const version = Number(FILE_PATTERN.exec(name)?.[1]);
      if (snapshot.format !== SNAPSHOT_FORMAT || snapshot.schemaVersion !== version) {
        throw new Error(
          `${name}: 스냅샷 형식이나 버전(${snapshot.schemaVersion})이 파일 이름과 다르다`
        );
      }
      return snapshot;
    });
}
