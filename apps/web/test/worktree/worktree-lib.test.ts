import { describe, expect, it } from "vitest";
import {
  formatSlotFile,
  hasKakaoRedirect,
  isAgentProcess,
  isLocalEnvFile,
  isOrphanCwd,
  orphanSlotDatabases,
  parseSlotFile,
  parseWorktreeList,
  partitionListeners,
  pickSlot,
  slotDatabases,
  slotEnv,
  stopTargets,
  WATCHDOG_MARKER,
  webPort,
} from "../../../../scripts/worktree-lib.mjs";

const allFree = () => true;

describe("webPort", () => {
  it("uses 4001 for the main checkout (slot 0)", () => {
    expect(webPort(0)).toBe(4001);
  });

  it("puts slots in the 4000s, 10 ports apart, clear of other projects' 3000s", () => {
    expect(webPort(1)).toBe(4011);
    expect(webPort(9)).toBe(4091);
  });
});

describe("hasKakaoRedirect", () => {
  it("covers the main checkout and slots 1 to 3", () => {
    expect([0, 1, 2, 3].map(hasKakaoRedirect)).toEqual([true, true, true, true]);
  });

  it("leaves slots 4 to 9 to the dev login", () => {
    expect([4, 9].map(hasKakaoRedirect)).toEqual([false, false]);
  });
});

describe("slotDatabases", () => {
  it("keeps seedbook / seedbook_test for slot 0", () => {
    expect(slotDatabases(0)).toEqual({ dev: "seedbook", test: "seedbook_test" });
  });

  it("names slot databases seedbook_sN / seedbook_sN_test", () => {
    expect(slotDatabases(3)).toEqual({ dev: "seedbook_s3", test: "seedbook_s3_test" });
  });
});

describe("parseSlotFile", () => {
  it("reads the slot written by formatSlotFile", () => {
    expect(parseSlotFile(formatSlotFile(4))).toBe(4);
  });

  it("returns null when the line is missing", () => {
    expect(parseSlotFile("# nothing here\n")).toBeNull();
  });

  it("returns null for slots outside 1..9", () => {
    expect(parseSlotFile("SEEDBOOK_SLOT=0\n")).toBeNull();
    expect(parseSlotFile("SEEDBOOK_SLOT=10\n")).toBeNull();
  });
});

describe("pickSlot", () => {
  it("picks slot 1 when nothing is used", () => {
    expect(pickSlot({ used: new Set(), portFree: allFree })).toBe(1);
  });

  it("skips slots held by other worktrees", () => {
    expect(pickSlot({ used: new Set([1, 2]), portFree: allFree })).toBe(3);
  });

  it("skips slots whose web port is already taken", () => {
    expect(pickSlot({ used: new Set([1]), portFree: (port) => port !== 4021 })).toBe(3);
  });

  it("returns null when every slot is used or busy", () => {
    const used = new Set([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(pickSlot({ used, portFree: (port) => port !== 4091 })).toBeNull();
  });
});

describe("slotEnv", () => {
  it("gives slot 0 only the port, leaving the database to .env.local", () => {
    expect(slotEnv(0, {})).toEqual({ SEEDBOOK_SLOT: "0", PORT: "4001" });
  });

  it("points a slot at its own databases and auth URL", () => {
    expect(slotEnv(2, {})).toEqual({
      SEEDBOOK_SLOT: "2",
      PORT: "4021",
      DATABASE_URL: "postgresql://seedbook:seedbook@127.0.0.1:5432/seedbook_s2",
      TEST_DATABASE_URL: "postgresql://seedbook:seedbook@127.0.0.1:5432/seedbook_s2_test",
      BETTER_AUTH_URL: "http://localhost:4021",
    });
  });

  it("keeps a test database name that ends with _test", () => {
    const url = slotEnv(5, {}).TEST_DATABASE_URL ?? "";
    expect(new URL(url).pathname).toMatch(/_test$/);
  });

  it("does not override variables that are already set", () => {
    const env = slotEnv(2, { DATABASE_URL: "postgresql://elsewhere/db", PORT: "4000" });
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.PORT).toBeUndefined();
    expect(env.BETTER_AUTH_URL).toBe("http://localhost:4021");
  });

  it("uses POSTGRES_USER / POSTGRES_PASSWORD when set", () => {
    const env = slotEnv(1, { POSTGRES_USER: "me", POSTGRES_PASSWORD: "p@ss" });
    expect(env.DATABASE_URL).toBe("postgresql://me:p%40ss@127.0.0.1:5432/seedbook_s1");
  });
});

describe("parseWorktreeList", () => {
  it("returns worktree paths with the main checkout first", () => {
    const porcelain = [
      "worktree /repo",
      "HEAD abc",
      "branch refs/heads/main",
      "",
      "worktree /wt/feat-a",
      "HEAD def",
      "branch refs/heads/feat-a",
      "",
    ].join("\n");
    expect(parseWorktreeList(porcelain)).toEqual(["/repo", "/wt/feat-a"]);
  });
});

describe("orphanSlotDatabases", () => {
  const all = [
    "postgres",
    "seedbook",
    "seedbook_test",
    "seedbook_s1",
    "seedbook_s1_test",
    "seedbook_s2",
    "seedbook_s3_test",
    "seedbook_sx",
  ];

  it("selects slot databases no live worktree holds", () => {
    expect(orphanSlotDatabases(all, new Set([1]))).toEqual(["seedbook_s2", "seedbook_s3_test"]);
  });

  it("never selects the main databases", () => {
    const orphans = orphanSlotDatabases(all, new Set());
    expect(orphans).not.toContain("seedbook");
    expect(orphans).not.toContain("seedbook_test");
    expect(orphans).not.toContain("seedbook_sx");
  });
});

describe("isOrphanCwd", () => {
  const base = "/home/me/.herdr/worktrees/seedbook";

  function context(existing: string[], goneWorktrees: string[] = []) {
    const set = new Set(existing);
    return { base, goneWorktrees, exists: (path: string) => set.has(path) };
  }

  it("ignores processes whose cwd still exists", () => {
    const cwd = `${base}/feat-a/apps/web`;
    expect(isOrphanCwd(cwd, context([cwd]))).toBe(false);
  });

  it("selects a cwd inside a removed hwt worktree", () => {
    expect(isOrphanCwd(`${base}/feat-a/apps/web`, context([]))).toBe(true);
  });

  it("ignores a missing subdirectory of a live worktree", () => {
    expect(isOrphanCwd(`${base}/feat-a/apps/gone`, context([`${base}/feat-a`]))).toBe(false);
  });

  it("selects a cwd inside a prunable worktree outside the hwt base", () => {
    expect(isOrphanCwd("/elsewhere/wt/apps/web", context([], ["/elsewhere/wt"]))).toBe(true);
  });

  it("ignores missing paths outside the hwt base and known worktrees", () => {
    expect(isOrphanCwd("/home/me/project/seedbook/tmp", context([]))).toBe(false);
  });
});

describe("isLocalEnvFile", () => {
  it("matches .env, .env.local and .env.*.local", () => {
    expect(isLocalEnvFile(".env")).toBe(true);
    expect(isLocalEnvFile(".env.local")).toBe(true);
    expect(isLocalEnvFile(".env.development.local")).toBe(true);
  });

  it("skips tracked or unrelated files", () => {
    expect(isLocalEnvFile(".env.example")).toBe(false);
    expect(isLocalEnvFile(".worktree-slot")).toBe(false);
    expect(isLocalEnvFile(".envrc")).toBe(false);
  });
});

describe("isAgentProcess", () => {
  it("keeps agents and their MCP servers alive", () => {
    expect(isAgentProcess("/usr/local/bin/claude --resume")).toBe(true);
    expect(isAgentProcess("npm exec @playwright/mcp@latest")).toBe(true);
    expect(isAgentProcess("node /x/node_modules/.bin/playwright-mcp")).toBe(true);
  });

  it("lets dev servers be stopped", () => {
    expect(isAgentProcess("node ../../scripts/worktree.mjs env web next dev --port 4011")).toBe(
      false
    );
    expect(isAgentProcess("next-server (v16.4.6)")).toBe(false);
  });
});

describe("partitionListeners", () => {
  const main = "/home/me/project/seedbook";
  const mine = "/home/me/.herdr/worktrees/seedbook/feat-a";
  const nested = `${main}/.worktrees/feat-b`;
  const worktrees = [main, mine, nested];
  const at = (cwd: string | null) => ({ pid: 1, cwd });

  it("owns a listener whose cwd is the checkout or inside it", () => {
    const listeners = [at(mine), at(`${mine}/apps/web`)];
    expect(partitionListeners(listeners, { root: mine, worktrees })).toEqual({
      own: listeners,
      foreign: [],
    });
  });

  it("treats another worktree, another project and a sibling name prefix as foreign", () => {
    const listeners = [at(`${main}/apps/web`), at("/home/me/project/teum"), at(`${mine}-2/apps`)];
    expect(partitionListeners(listeners, { root: mine, worktrees })).toEqual({
      own: [],
      foreign: listeners,
    });
  });

  it("treats a listener with an unknown cwd as foreign", () => {
    const listeners = [at(null)];
    expect(partitionListeners(listeners, { root: mine, worktrees }).foreign).toEqual(listeners);
  });

  it("does not let the main checkout own a worktree nested inside it", () => {
    const listeners = [at(`${nested}/apps/web`), at(`${main}/apps/web`)];
    const { own, foreign } = partitionListeners(listeners, { root: main, worktrees });
    expect(own).toEqual([listeners[1]]);
    expect(foreign).toEqual([listeners[0]]);
  });
});

describe("stopTargets", () => {
  const wrapper = "node ../../scripts/worktree.mjs env web next dev --port $PORT";
  const table = new Map([
    [10, { ppid: 1, args: "claude" }],
    [20, { ppid: 10, args: "node /bin/pnpm dev" }],
    [25, { ppid: 20, args: `sh -c ${wrapper}` }],
    [30, { ppid: 25, args: `/usr/bin/${wrapper}` }],
    [40, { ppid: 30, args: "/bin/sh -c next dev --port $PORT" }],
    [50, { ppid: 40, args: "node next dev --port 4011" }],
    [60, { ppid: 50, args: "next-server (v16)" }],
    [70, { ppid: 60, args: "node postcss.js" }],
    [80, { ppid: 10, args: "node /mcp/server.js" }],
  ]);
  const all = () => true;
  const sorted = (pids: number[]) => [...pids].sort((a, b) => a - b);

  it("takes the whole tree under the pnpm dev wrapper, but not pnpm or the agent above it", () => {
    expect(sorted(stopTargets([60], table, { isOwn: all }))).toEqual([30, 40, 50, 60, 70]);
  });

  it("leaves the wrapper's watchdog alive so it can clean up after a SIGKILL", () => {
    const watched = new Map([
      ...table,
      [90, { ppid: 30, args: `/usr/bin/node -e ${WATCHDOG_MARKER}const g=1 40` }],
    ]);
    expect(stopTargets([60], watched, { isOwn: all })).not.toContain(90);
  });

  it("takes only the listener and its descendants when there is no wrapper", () => {
    const bare = new Map([...table, [30, { ppid: 25, args: "node something-else.js" }]]);
    expect(sorted(stopTargets([60], bare, { isOwn: all }))).toEqual([60, 70]);
  });

  it("leaves processes outside the checkout alone", () => {
    expect(sorted(stopTargets([60], table, { isOwn: (pid) => pid !== 70 }))).toEqual([
      30, 40, 50, 60,
    ]);
    expect(sorted(stopTargets([60], table, { isOwn: (pid) => pid !== 30 }))).toEqual([60, 70]);
  });

  it("does not repeat a pid when several listeners share a wrapper", () => {
    expect(sorted(stopTargets([60, 70], table, { isOwn: all }))).toEqual([30, 40, 50, 60, 70]);
  });

  it("stops at a ppid cycle instead of looping", () => {
    const cycle = new Map([
      [5, { ppid: 6, args: "a" }],
      [6, { ppid: 5, args: "b" }],
    ]);
    expect(sorted(stopTargets([5], cycle, { isOwn: all }))).toEqual([5, 6]);
  });
});
