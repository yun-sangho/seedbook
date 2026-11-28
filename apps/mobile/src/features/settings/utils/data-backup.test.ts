import type { InvestmentItem } from "@mobile/features/investments/types/types";
import type { PortfolioItem } from "@mobile/features/portfolio/types/types";
import type { RebalancingSession } from "@mobile/features/rebalancing/types/types";
import { describe, expect, it } from "vitest";
import { backupFileName, buildBackup, parseBackup } from "./data-backup";

const investment = { id: "acc-1", accountName: "ISA" } as InvestmentItem;
const portfolio = (id: string, accountIds: string[], updatedAt: string) =>
  ({ id, name: id, accountIds, updatedAt, allocations: [] }) as unknown as PortfolioItem;
const session = { id: "s-1", accountId: "acc-1", tasks: [] } as unknown as RebalancingSession;

describe("buildBackup", () => {
  it("includes investments, portfolios and rebalancing sessions with a version and timestamp", () => {
    const backup = buildBackup(
      {
        investments: [investment],
        portfolios: [portfolio("p1", ["acc-1"], "2026-11-01T00:00:00.000Z")],
        rebalancingSessions: [session],
      },
      "tag-a",
      new Date("2026-11-08T00:00:00.000Z")
    );

    expect(backup).toEqual({
      investments: [investment],
      portfolios: [portfolio("p1", ["acc-1"], "2026-11-01T00:00:00.000Z")],
      rebalancingSessions: [session],
      exportedAt: "2026-11-08T00:00:00.000Z",
      version: "2.0",
      accountTag: "tag-a",
    });
  });
});

describe("parseBackup", () => {
  it("restores every section of a current backup", () => {
    const backup = buildBackup(
      {
        investments: [investment],
        portfolios: [portfolio("p1", ["acc-1"], "2026-11-01T00:00:00.000Z")],
        rebalancingSessions: [session],
      },
      "tag-a"
    );

    expect(parseBackup(backup)).toEqual({
      ok: true,
      data: {
        investments: [investment],
        portfolios: [portfolio("p1", ["acc-1"], "2026-11-01T00:00:00.000Z")],
        rebalancingSessions: [session],
      },
      accountTag: "tag-a",
    });
  });

  it("restores only the sections an older backup contains", () => {
    const old = {
      investments: [investment],
      savings: [{ id: "x" }],
      exportedAt: "2026-01-01T00:00:00.000Z",
      version: "1.0",
    };

    expect(parseBackup(old)).toEqual({
      ok: true,
      data: { investments: [investment] },
      accountTag: null,
    });
  });

  it("keeps each account in only one portfolio", () => {
    const backup = {
      portfolios: [
        portfolio("older", ["acc-1"], "2026-01-01T00:00:00.000Z"),
        portfolio("newer", ["acc-1"], "2026-02-01T00:00:00.000Z"),
      ],
      exportedAt: "2026-11-08T00:00:00.000Z",
      version: "2.0",
    };

    const result = parseBackup(backup);

    expect(result.ok && result.data.portfolios?.map((p) => [p.id, p.accountIds])).toEqual([
      ["older", []],
      ["newer", ["acc-1"]],
    ]);
  });

  it("rejects a file that is not a Seedbook backup", () => {
    expect(parseBackup({ investments: [] })).toEqual({ ok: false });
    expect(parseBackup("nope")).toEqual({ ok: false });
    expect(parseBackup(null)).toEqual({ ok: false });
  });

  it("ignores a section that is not a list", () => {
    const backup = { investments: "broken", exportedAt: "2026-11-08", version: "2.0" };

    expect(parseBackup(backup)).toEqual({ ok: true, data: {}, accountTag: null });
  });
});

describe("backupFileName", () => {
  it("names the export file after the export date", () => {
    expect(backupFileName(new Date("2026-11-16T09:30:00.000Z"))).toBe(
      "seedbook-data-2026-11-16.json"
    );
  });
});
