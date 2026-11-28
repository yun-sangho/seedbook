import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEPLOY_WORKFLOWS,
  expectedWorkflows,
  failedStepNames,
  findDeployRun,
  matchesPath,
  runVerdict,
  successorRun,
} from "../../../../scripts/check-deploy-lib.mjs";

const SHA = "c973535d0719e31656e796792a7ea25044441d16";

const run = (overrides: Record<string, unknown>) => ({
  databaseId: 1,
  headSha: SHA,
  event: "push",
  status: "completed",
  conclusion: "success",
  createdAt: "2026-11-26T15:25:45Z",
  ...overrides,
});

describe("findDeployRun", () => {
  it("returns null when no run exists for the merge commit yet", () => {
    expect(findDeployRun([], SHA)).toBeNull();
  });

  it("ignores runs for other commits", () => {
    const runs = [run({ headSha: "other" })];
    expect(findDeployRun(runs, SHA)).toBeNull();
  });

  it("ignores manual workflow_dispatch runs on the same commit", () => {
    const runs = [run({ databaseId: 2, event: "workflow_dispatch" })];
    expect(findDeployRun(runs, SHA)).toBeNull();
  });

  it("picks the latest push run when the commit has several", () => {
    const runs = [
      run({ databaseId: 1, createdAt: "2026-11-26T15:00:00Z" }),
      run({ databaseId: 3, createdAt: "2026-11-26T16:00:00Z" }),
      run({ databaseId: 2, createdAt: "2026-11-26T15:30:00Z" }),
    ];
    expect(findDeployRun(runs, SHA)?.databaseId).toBe(3);
  });
});

describe("runVerdict", () => {
  it("is missing when there is no run", () => {
    expect(runVerdict(null)).toBe("missing");
  });

  it("is pending while the run is queued or in progress", () => {
    expect(runVerdict(run({ status: "in_progress", conclusion: "" }))).toBe("pending");
  });

  it("is success when the run completed successfully", () => {
    expect(runVerdict(run({}))).toBe("success");
  });

  it("is cancelled when a later push cancelled the pending run", () => {
    expect(runVerdict(run({ conclusion: "cancelled" }))).toBe("cancelled");
  });

  it("is failure when the run completed with any other conclusion", () => {
    expect(runVerdict(run({ conclusion: "failure" }))).toBe("failure");
  });
});

describe("failedStepNames", () => {
  it("lists failed steps as job / step", () => {
    const jobs = [
      {
        name: "checks / checks",
        conclusion: "failure",
        steps: [
          { name: "Lint", conclusion: "success" },
          { name: "Unit tests", conclusion: "failure" },
        ],
      },
      {
        name: "deploy",
        conclusion: "success",
        steps: [{ name: "SSH", conclusion: "success" }],
      },
    ];
    expect(failedStepNames(jobs)).toEqual(["checks / checks / Unit tests"]);
  });

  it("falls back to the job name when a failed job has no failed step", () => {
    const jobs = [{ name: "build-web", conclusion: "cancelled", steps: [] }];
    expect(failedStepNames(jobs)).toEqual(["build-web (cancelled)"]);
  });

  it("is empty when every job succeeded or was skipped", () => {
    const jobs = [
      { name: "build-web", conclusion: "skipped", steps: [] },
      { name: "deploy", conclusion: "success", steps: [] },
    ];
    expect(failedStepNames(jobs)).toEqual([]);
  });
});

describe("successorRun", () => {
  it("returns the first push run created after the cancelled one", () => {
    const cancelled = run({ databaseId: 1, createdAt: "2026-11-26T15:00:00Z" });
    const runs = [
      cancelled,
      run({ databaseId: 3, headSha: "c", createdAt: "2026-11-26T15:20:00Z" }),
      run({ databaseId: 2, headSha: "b", createdAt: "2026-11-26T15:10:00Z" }),
    ];
    expect(successorRun(runs, cancelled)?.databaseId).toBe(2);
  });

  it("returns null while no later run exists yet", () => {
    const cancelled = run({ databaseId: 1 });
    expect(successorRun([cancelled], cancelled)).toBeNull();
  });

  it("ignores later manual runs", () => {
    const cancelled = run({ databaseId: 1, createdAt: "2026-11-26T15:00:00Z" });
    const runs = [
      cancelled,
      run({ databaseId: 2, event: "workflow_dispatch", createdAt: "2026-11-26T15:10:00Z" }),
    ];
    expect(successorRun(runs, cancelled)).toBeNull();
  });
});

describe("matchesPath", () => {
  it("matches everything under a dir/** pattern", () => {
    expect(matchesPath("apps/web/app/m/page.tsx", "apps/web/**")).toBe(true);
  });

  it("does not match a sibling dir that shares the prefix", () => {
    expect(matchesPath("apps/web-old/x.ts", "apps/web/**")).toBe(false);
  });

  it("matches a single-segment wildcard", () => {
    expect(
      matchesPath(
        "packages/database/scripts/backfill-x.ts",
        "packages/database/scripts/backfill-*.ts"
      )
    ).toBe(true);
  });

  it("does not let a single-segment wildcard cross a slash", () => {
    expect(
      matchesPath(
        "packages/database/scripts/backfill-a/b.ts",
        "packages/database/scripts/backfill-*.ts"
      )
    ).toBe(false);
  });

  it("requires an exact match for plain paths", () => {
    expect(matchesPath("apps/web/package.json", "package.json")).toBe(false);
  });
});

describe("expectedWorkflows", () => {
  it("expects only the web deploy for web changes", () => {
    expect(expectedWorkflows(["apps/web/app/page.tsx"])).toEqual(["deploy-web.yml"]);
  });

  it("expects only the crawler deploy for migrations", () => {
    expect(expectedWorkflows(["packages/database/migrations/0042_x.sql"])).toEqual([
      "deploy-crawler.yml",
    ]);
  });

  it("expects both for shared database source", () => {
    expect(expectedWorkflows(["packages/database/src/schema.ts"])).toEqual([
      "deploy-web.yml",
      "deploy-crawler.yml",
    ]);
  });

  it("expects both when the compose file changes", () => {
    expect(expectedWorkflows(["docker-compose.yml"])).toEqual([
      "deploy-web.yml",
      "deploy-crawler.yml",
    ]);
  });

  it("expects nothing for docs and dev-only seed data", () => {
    expect(expectedWorkflows(["CLAUDE.md", "packages/database/seed-data/stocks.json"])).toEqual([]);
  });
});

// 워크플로 YAML 의 on.push.paths 목록 (이 레포 워크플로 모양만 읽는 단순 파서)
function workflowPushPaths(file: string): string[] {
  const text = readFileSync(resolve(__dirname, "../../../../.github/workflows", file), "utf8");
  const lines = text.split("\n");
  const start = lines.indexOf("    paths:");
  const paths: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const match = line.match(/^ {6}- (.+)$/);
    if (!match?.[1]) break;
    paths.push(match[1]);
  }
  return paths;
}

describe("DEPLOY_WORKFLOWS", () => {
  it.each(DEPLOY_WORKFLOWS)("matches the push paths of $file", ({ file, paths }) => {
    expect([...paths].sort()).toEqual(workflowPushPaths(file).sort());
  });
});
