/**
 * `pnpm schema:check` — 레코드 정의를 출시 스냅샷과 비교한다 (설계 §7.5). CI 필수 단계.
 */
import { checkSchema } from "../src/compat";
import { RECORDS } from "../src/records";
import { validateDefinitions } from "../src/validate-definitions";
import { currentSnapshot, readReleasedSnapshots } from "./snapshot-files";

const definitionErrors = validateDefinitions(RECORDS);
const current = currentSnapshot();
const released = readReleasedSnapshots();
const { errors, changes } = checkSchema(current, released);
const allErrors = [...definitionErrors, ...errors];

const latest = released.reduce((max, s) => Math.max(max, s.schemaVersion), 0);
console.log(
  `레코드 ${RECORDS.length}종, SCHEMA_VERSION ${current.schemaVersion}, MIN_SCHEMA ${current.minSchema}, ` +
    (latest ? `최근 출시 스냅샷 v${latest}` : "출시 스냅샷 없음 (출시 전)")
);
for (const change of changes) {
  console.log(
    `  ${change.kind === "breaking" ? "깨는 변경" : "확장"} ${change.path}: ${change.message}`
  );
}
if (allErrors.length > 0) {
  console.error("\nschema:check 실패");
  for (const error of allErrors) console.error(`- ${error}`);
  process.exit(1);
}
console.log("schema:check 통과");
