import { describe, expect, it } from "vitest";
import { lastDeployedSha, matchesPath, planDeploy } from "../../../../scripts/deploy-plan-lib.mjs";

const run = (overrides: Record<string, unknown>) => ({
  head_sha: "aaa",
  head_branch: "main",
  event: "push",
  status: "completed",
  conclusion: "success",
  created_at: "2026-11-27T10:00:00Z",
  ...overrides,
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

describe("lastDeployedSha", () => {
  it("returns null when no deploy run succeeded", () => {
    expect(lastDeployedSha([], "main")).toBeNull();
  });

  it("picks the most recently created successful run", () => {
    const runs = [
      run({ head_sha: "old", created_at: "2026-11-27T09:00:00Z" }),
      run({ head_sha: "new", created_at: "2026-11-27T11:00:00Z" }),
    ];
    expect(lastDeployedSha(runs, "main")).toBe("new");
  });

  it("skips cancelled and failed runs", () => {
    const runs = [
      run({ head_sha: "ok", created_at: "2026-11-27T09:00:00Z" }),
      run({ head_sha: "cancelled", conclusion: "cancelled", created_at: "2026-11-27T10:00:00Z" }),
      run({ head_sha: "failed", conclusion: "failure", created_at: "2026-11-27T11:00:00Z" }),
    ];
    expect(lastDeployedSha(runs, "main")).toBe("ok");
  });

  it("counts a manual workflow_dispatch run as a deploy", () => {
    const runs = [
      run({ head_sha: "push", created_at: "2026-11-27T09:00:00Z" }),
      run({ head_sha: "manual", event: "workflow_dispatch", created_at: "2026-11-27T10:00:00Z" }),
    ];
    expect(lastDeployedSha(runs, "main")).toBe("manual");
  });

  it("ignores runs on other branches and other events", () => {
    const runs = [
      run({ head_sha: "ok", created_at: "2026-11-27T09:00:00Z" }),
      run({ head_sha: "branch", head_branch: "feat/x", created_at: "2026-11-27T10:00:00Z" }),
      run({ head_sha: "pr", event: "pull_request", created_at: "2026-11-27T11:00:00Z" }),
    ];
    expect(lastDeployedSha(runs, "main")).toBe("ok");
  });
});

describe("planDeploy", () => {
  it("deploys both services when there is no base to compare with", () => {
    expect(planDeploy(null)).toEqual({ services: ["web", "stock-crawler"], deploy: true });
  });

  it("builds only web for web changes", () => {
    expect(planDeploy(["apps/web/app/page.tsx"])).toEqual({ services: ["web"], deploy: true });
  });

  it("builds only the crawler for migrations", () => {
    expect(planDeploy(["packages/database/migrations/0042_x.sql"])).toEqual({
      services: ["stock-crawler"],
      deploy: true,
    });
  });

  it("builds both for shared database source", () => {
    expect(planDeploy(["packages/database/src/schema.ts"]).services).toEqual([
      "web",
      "stock-crawler",
    ]);
  });

  it("builds both when the deploy workflow or plan script changes", () => {
    expect(planDeploy([".github/workflows/deploy.yml"]).services).toEqual(["web", "stock-crawler"]);
    expect(planDeploy(["scripts/deploy-plan-lib.mjs"]).services).toEqual(["web", "stock-crawler"]);
  });

  it("redeploys without building when only the compose file changes", () => {
    expect(planDeploy(["docker-compose.yml"])).toEqual({ services: [], deploy: true });
  });

  it("does nothing for docs and dev-only seed data", () => {
    expect(planDeploy(["CLAUDE.md", "packages/database/seed-data/stocks.json"])).toEqual({
      services: [],
      deploy: false,
    });
  });

  it("covers changes from cancelled runs since the last deploy", () => {
    // 지난 배포 뒤 web 변경(취소된 run) + 문서 변경(이번 run) → web 을 빌드한다
    expect(planDeploy(["apps/web/lib/x.ts", "README.md"])).toEqual({
      services: ["web"],
      deploy: true,
    });
  });
});
