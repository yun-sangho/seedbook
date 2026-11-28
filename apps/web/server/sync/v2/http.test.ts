// @vitest-environment node
import { MAX_PUSH_OPS, MIN_SCHEMA, SCHEMA_VERSION } from "@seedbook/domain";
import { describe, expect, it, vi } from "vitest";
import { handlePull } from "./pull";
import { handlePush } from "./push";

// 요청 검증은 DB 앞에서 끝난다 — 빈 ops 는 트랜잭션을 열지 않는다.
vi.mock("@seedbook/database", async (importOriginal) => ({
  schema: (await importOriginal<typeof import("@seedbook/database")>()).schema,
}));

const deps = (userId: string | null = "user-1") => ({
  db: {} as never,
  resolveUserId: async () => userId,
  log: () => {},
});

function headers(schema: number | null = SCHEMA_VERSION, protocol: string | null = "2") {
  const h = new Headers();
  if (protocol !== null) h.set("x-seedbook-sync", protocol);
  if (schema !== null) h.set("x-seedbook-schema", String(schema));
  return h;
}

const pushRequest = (body: unknown, h = headers()) =>
  new Request("http://localhost/api/sync/v2/push", {
    method: "POST",
    headers: h,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const pullRequest = (query = "", h = headers()) =>
  new Request(`http://localhost/api/sync/v2/pull${query}`, { headers: h });

describe("version gate", () => {
  it.each([
    ["push", (h: Headers) => handlePush(pushRequest({ ops: [] }, h), deps())],
    ["pull", (h: Headers) => handlePull(pullRequest("", h), deps())],
  ])(
    "%s answers 426 with minSchema when the app's data version is below MIN_SCHEMA",
    async (_, send) => {
      const res = await send(headers(MIN_SCHEMA - 1));

      expect(res.status).toBe(426);
      expect(await res.json()).toEqual({ code: "schema_too_old", minSchema: MIN_SCHEMA });
    }
  );

  it.each([
    ["push", (h: Headers) => handlePush(pushRequest({ ops: [] }, h), deps())],
    ["pull", (h: Headers) => handlePull(pullRequest("", h), deps())],
  ])("%s answers 409 schema_ahead when the app is newer than the server", async (_, send) => {
    const res = await send(headers(SCHEMA_VERSION + 1));

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ code: "schema_ahead", schema: SCHEMA_VERSION });
  });

  it("accepts the current data version", async () => {
    const res = await handlePush(pushRequest({ ops: [] }), deps());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results: [] });
  });

  it.each([
    ["no protocol header", headers(SCHEMA_VERSION, null), "protocol"],
    ["another protocol", headers(SCHEMA_VERSION, "1"), "protocol"],
    ["no schema header", headers(null), "schema_header"],
  ])("answers 400 with %s", async (_, h, code) => {
    const res = await handlePush(pushRequest({ ops: [] }, h), deps());

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code });
  });

  it("checks the version before the session so an old app learns to update", async () => {
    const res = await handlePush(pushRequest({ ops: [] }, headers(MIN_SCHEMA - 1)), deps(null));

    expect(res.status).toBe(426);
  });
});

describe("push request", () => {
  it("answers 401 without a session", async () => {
    expect((await handlePush(pushRequest({ ops: [] }), deps(null))).status).toBe(401);
  });

  it.each([
    ["invalid json", "{"],
    ["no ops", { mutations: [] }],
  ])("answers 400 for %s", async (_, body) => {
    expect((await handlePush(pushRequest(body), deps())).status).toBe(400);
  });

  it("answers 413 for too many ops", async () => {
    const ops = Array.from({ length: MAX_PUSH_OPS + 1 }, () => ({}));

    expect((await handlePush(pushRequest({ ops }), deps())).status).toBe(413);
  });

  it("answers 413 for a body over 1MB", async () => {
    const body = JSON.stringify({ ops: [], pad: "x".repeat(1_000_001) });

    expect((await handlePush(pushRequest(body), deps())).status).toBe(413);
  });
});

describe("pull request", () => {
  it("answers 401 without a session", async () => {
    expect((await handlePull(pullRequest(), deps(null))).status).toBe(401);
  });

  it.each([["?cursor=nope"], ["?limit=0"], ["?limit=1001"], ["?limit=abc"]])(
    "answers 400 for %s",
    async (query) => {
      expect((await handlePull(pullRequest(query), deps())).status).toBe(400);
    }
  );
});
