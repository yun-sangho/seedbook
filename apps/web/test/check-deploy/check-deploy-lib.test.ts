import { describe, expect, it } from "vitest";
import {
  failedStepNames,
  findDeployRun,
  runVerdict,
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

  it("is failure when the run completed with any other conclusion", () => {
    expect(runVerdict(run({ conclusion: "cancelled" }))).toBe("failure");
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
