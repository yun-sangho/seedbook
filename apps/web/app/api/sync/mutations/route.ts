import { db } from "@seedbook/database";
import { resolveUserId } from "@web/lib/auth-server";
import { applyMutation } from "@web/server/sync/apply-mutation";
import { MAX_MUTATIONS, type MutationResult } from "@web/server/sync/types";

/**
 * 엔티티 단위 동기화 쓰기. body `{ mutations: Mutation[] }` 를 순서대로 적용하고
 * mutation 마다 결과(`ok` / `conflict` / `rejected`)를 같은 순서로 돌려준다.
 * 각 mutation 은 독립적으로 적용된다 — 하나가 충돌해도 나머지는 진행.
 */
export async function POST(request: Request): Promise<Response> {
  const userId = await resolveUserId(request);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const mutations = (body as { mutations?: unknown } | null)?.mutations;
  if (!Array.isArray(mutations)) {
    return Response.json({ error: "body must be { mutations: [...] }" }, { status: 400 });
  }
  if (mutations.length > MAX_MUTATIONS) {
    return Response.json({ error: `at most ${MAX_MUTATIONS} mutations` }, { status: 413 });
  }

  const results: MutationResult[] = [];
  for (const mutation of mutations) {
    results.push(await applyMutation(db, userId, mutation));
  }
  return Response.json({ results });
}
