/**
 * `pnpm --filter @seedbook/domain schema:snapshot` — 출시할 때 지금 정의를
 * `schema-snapshots/v<SCHEMA_VERSION>.json` 으로 남긴다. 이미 있는 파일은 덮어쓰지 않는다.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkSchema } from "../src/compat";
import { stableStringify } from "../src/snapshot";
import {
  currentSnapshot,
  readReleasedSnapshots,
  SNAPSHOT_DIR,
  snapshotFileName,
} from "./snapshot-files";

const current = currentSnapshot();
const { errors } = checkSchema(current, readReleasedSnapshots());
if (errors.length > 0) {
  console.error("schema:check 를 먼저 통과해야 한다:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const path = join(SNAPSHOT_DIR, snapshotFileName(current.schemaVersion));
if (existsSync(path)) {
  console.error(`${path} 가 이미 있다 — 출시 스냅샷은 고치지 않는다. SCHEMA_VERSION 을 올린다.`);
  process.exit(1);
}
mkdirSync(SNAPSHOT_DIR, { recursive: true });
writeFileSync(path, `${stableStringify(current)}\n`);
console.log(`${path} 를 만들었다. 커밋한다 (지우거나 고치지 않는다).`);
