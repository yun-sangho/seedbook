import { auth } from "@web/lib/auth";
import { isCloudStoreKey } from "@web/lib/storage-mode";
import { prisma } from "@seedbook/database";

/**
 * 사용자 자산 데이터의 클라우드 저장 엔드포인트.
 *
 * - `GET /api/storage/[key]` — 현재 로그인한 사용자의 `key` envelope 를 돌려준다.
 *   데이터가 아직 없으면 `{ data: null }` 로 200 을 반환한다 (404 는 라우트 오타
 *   같은 진짜 실패와 혼동되므로 사용하지 않는다).
 * - `PUT /api/storage/[key]` — `{ data }` envelope 를 upsert 한다. `data` 는
 *   Zustand persist 가 생성하는 `{ state, version }` 객체 그대로. 서버는
 *   내용을 검사하지 않고 opaque JSON 으로 저장한다.
 *
 * 보안:
 *   - 세션이 없으면 401 → 클라이언트가 로그인 화면으로 redirect.
 *   - `key` 는 `CLOUD_STORE_KEYS` 화이트리스트 안에 있어야 한다. 그 외는 400.
 *   - body 가 2MB 를 넘으면 413.
 */

// 2MB 상한. 설계 단계 안전장치 — 일반적인 6 개 store envelope 는 이보다 훨씬
// 작아야 정상이다.
const MAX_BODY_BYTES = 2 * 1024 * 1024;

type RouteContext = {
  params: Promise<{ key: string }>;
};

async function resolveUserId(request: Request): Promise<string | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user?.id ?? null;
}

function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const { key } = await context.params;
  if (!isCloudStoreKey(key)) return badRequest("invalid store key");

  const userId = await resolveUserId(request);
  if (!userId) return unauthorized();

  const row = await prisma.userStore.findUnique({
    where: { userId_key: { userId, key } },
    select: { data: true, updatedAt: true },
  });

  return Response.json({
    data: row?.data ?? null,
    updatedAt: row?.updatedAt?.toISOString() ?? null,
  });
}

export async function PUT(request: Request, context: RouteContext): Promise<Response> {
  const { key } = await context.params;
  if (!isCloudStoreKey(key)) return badRequest("invalid store key");

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return Response.json({ error: "payload too large" }, { status: 413 });
  }

  const userId = await resolveUserId(request);
  if (!userId) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("invalid json");
  }

  if (!body || typeof body !== "object" || !("data" in body)) {
    return badRequest("body must be { data: ... }");
  }

  const data = (body as { data: unknown }).data;

  // `data: null` 은 "이 store 를 클라우드에서 지우라" 는 시맨틱.
  if (data === null) {
    await prisma.userStore.deleteMany({ where: { userId, key } });
    return Response.json({ ok: true });
  }

  await prisma.userStore.upsert({
    where: { userId_key: { userId, key } },
    create: { userId, key, data: data as object },
    update: { data: data as object },
  });

  return Response.json({ ok: true });
}
