import type { InvestmentItem } from "@mobile/features/investments/types/types";
import type { PortfolioItem } from "@mobile/features/portfolio/types/types";
import type { RebalancingSession } from "@mobile/features/rebalancing/types/types";
import { describe, expect, it } from "vitest";
import { backupAccountTag, resolveBackupIds } from "./backup-ids";
import type { BackupSections } from "./data-backup";

const file: BackupSections = {
  investments: [
    { id: "acc-1", accountName: "ISA", holdings: [{ id: "h-1" }], cashItems: [{ id: "c-1" }] },
    { id: "acc-2", accountName: "IRP", holdings: [], cashItems: [{ id: "c-2" }] },
  ] as unknown as InvestmentItem[],
  portfolios: [
    { id: "p-1", accountIds: ["acc-1", "acc-2"], allocations: [{ id: "al-1" }] },
  ] as unknown as PortfolioItem[],
  rebalancingSessions: [
    { id: "s-1", accountId: "acc-1", portfolioId: "p-1", tasks: [{ id: "al-1" }] },
  ] as unknown as RebalancingSession[],
};

/** 서버에 이 계정의 행으로 있는 id. */
const cloud = (...ids: string[]) => ({ fetchOwnIds: async () => new Set(ids) });
const offline = {
  fetchOwnIds: async (): Promise<Set<string>> => {
    throw new Error("offline");
  },
};

const rowIds = (d: Partial<BackupSections>) => [
  ...(d.investments ?? []).flatMap((i) => [
    i.id,
    ...i.holdings.map((h) => h.id),
    ...i.cashItems.map((c) => c.id),
  ]),
  ...(d.portfolios ?? []).flatMap((p) => [p.id, ...p.allocations.map((a) => a.id)]),
  ...(d.rebalancingSessions ?? []).map((s) => s.id),
];

describe("backupAccountTag", () => {
  it("is the same for the same account and different for another", async () => {
    expect(await backupAccountTag("user-a")).toBe(await backupAccountTag("user-a"));
    expect(await backupAccountTag("user-a")).not.toBe(await backupAccountTag("user-b"));
  });

  it("does not contain the user id", async () => {
    expect(await backupAccountTag("user-a")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("resolveBackupIds", () => {
  it("keeps every id of a backup exported from the same account, even offline", async () => {
    const accountTag = await backupAccountTag("user-a");

    const result = await resolveBackupIds({ data: file, accountTag }, "user-a", offline);

    expect(result.data).toEqual(file);
  });

  it("gives every row of another account's backup a new id, even offline", async () => {
    const accountTag = await backupAccountTag("user-a");

    const { data } = await resolveBackupIds({ data: file, accountTag }, "user-b", offline);

    expect(rowIds(data)).toHaveLength(rowIds(file).length);
    expect(rowIds(data).filter((id) => rowIds(file).includes(id))).toEqual([]);
  });

  it("keeps references of another account's backup pointing at the same rows", async () => {
    const accountTag = await backupAccountTag("user-a");

    const { data } = await resolveBackupIds({ data: file, accountTag }, "user-b", offline);

    const [first, second] = data.investments!;
    const portfolio = data.portfolios![0]!;
    const session = data.rebalancingSessions![0]!;
    expect(portfolio.accountIds).toEqual([first!.id, second!.id]);
    expect(session.accountId).toBe(first!.id);
    expect(session.portfolioId).toBe(portfolio.id);
    expect(session.tasks[0]!.id).toBe(portfolio.allocations[0]!.id);
  });

  it("gives the same new ids when the same file is imported again", async () => {
    const backup = { data: file, accountTag: await backupAccountTag("user-a") };

    const first = await resolveBackupIds(backup, "user-b", offline);
    const second = await resolveBackupIds(backup, "user-b", offline);

    expect(second).toEqual(first);
  });

  it("keeps the ids of an untagged backup whose rows belong to this account on the server", async () => {
    const result = await resolveBackupIds(
      { data: file, accountTag: null },
      "user-a",
      cloud("acc-1", "acc-2", "p-1", "s-1")
    );

    expect(result.data).toEqual(file);
  });

  it("changes only the rows of an untagged backup that are not this account's", async () => {
    const { data } = await resolveBackupIds(
      { data: file, accountTag: null },
      "user-a",
      cloud("acc-1", "p-1")
    );

    const [mine, unknown] = data.investments!;
    expect(mine).toEqual(file.investments[0]);
    expect(unknown!.id).not.toBe("acc-2");
    expect(unknown!.cashItems[0]!.id).not.toBe("c-2");
    expect(data.portfolios![0]!.accountIds).toEqual(["acc-1", unknown!.id]);
    expect(data.portfolios![0]!.allocations).toEqual(file.portfolios[0]!.allocations);
    expect(data.rebalancingSessions![0]!.tasks).toEqual(file.rebalancingSessions[0]!.tasks);
  });

  it("gives an untagged backup new ids when this account has none of its rows", async () => {
    const { data } = await resolveBackupIds({ data: file, accountTag: null }, "user-b", cloud());

    expect(rowIds(data).filter((id) => rowIds(file).includes(id))).toEqual([]);
  });

  it("fails instead of guessing when an untagged backup cannot be checked", async () => {
    await expect(
      resolveBackupIds({ data: file, accountTag: null }, "user-a", offline)
    ).rejects.toThrow("offline");
  });

  it("leaves references to rows that are not in the file alone", async () => {
    const { data } = await resolveBackupIds(
      { data: { portfolios: file.portfolios }, accountTag: null },
      "user-b",
      cloud()
    );

    expect(data.portfolios![0]!.accountIds).toEqual(["acc-1", "acc-2"]);
    expect(Object.keys(data)).toEqual(["portfolios"]);
  });
});
