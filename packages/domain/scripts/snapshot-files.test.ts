import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { stableStringify } from "../src/snapshot";
import { SCHEMA_VERSION } from "../src/version";
import { currentSnapshot, readReleasedSnapshots } from "./snapshot-files";

describe("readReleasedSnapshots", () => {
  it("returns nothing when the folder does not exist", () => {
    expect(readReleasedSnapshots(join(tmpdir(), "no-such-schema-snapshots"))).toEqual([]);
  });

  it("reads v<N>.json files and ignores other files", () => {
    const dir = mkdtempSync(join(tmpdir(), "schema-snapshots-"));
    writeFileSync(join(dir, `v${SCHEMA_VERSION}.json`), stableStringify(currentSnapshot()));
    writeFileSync(join(dir, "README.md"), "#");

    expect(readReleasedSnapshots(dir).map((s) => s.schemaVersion)).toEqual([SCHEMA_VERSION]);
  });

  it("fails when the file name and the version inside disagree", () => {
    const dir = mkdtempSync(join(tmpdir(), "schema-snapshots-"));
    writeFileSync(join(dir, `v${SCHEMA_VERSION + 1}.json`), stableStringify(currentSnapshot()));

    expect(() => readReleasedSnapshots(dir)).toThrow();
  });

  it("round-trips the current definitions through the file format", () => {
    const snapshot = currentSnapshot();

    expect(JSON.parse(stableStringify(snapshot))).toEqual(snapshot);
  });
});
