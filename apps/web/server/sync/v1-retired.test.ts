// @vitest-environment node

import { GET as storageGet, PUT as storagePut } from "@web/app/api/storage/[key]/route";
import { POST as mutations } from "@web/app/api/sync/mutations/route";
import { GET as pull } from "@web/app/api/sync/pull/route";
import { describe, expect, it, vi } from "vitest";

describe("retired sync v1 endpoints", () => {
  it.each([
    ["POST", "/api/sync/mutations", mutations],
    ["GET", "/api/sync/pull?since=0", pull],
    ["GET", "/api/storage/investment-storage", storageGet],
    ["PUT", "/api/storage/portfolio-storage", storagePut],
  ] as const)("%s %s answers 426 so an old cached client stops", async (method, path, handler) => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const res = await handler(new Request(`http://localhost${path}`, { method }));

    expect(res.status).toBe(426);
    expect(await res.json()).toMatchObject({ code: "sync_v1_retired", protocol: 2 });
  });
});
