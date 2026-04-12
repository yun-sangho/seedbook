import { TRANSLATORS, type Envelope } from "@web/app/api/storage/_translators";
import { auth } from "@web/lib/auth";
import { isCloudStoreKey } from "@web/lib/storage-mode";
import { prisma } from "@seedbook/database";

/**
 * 사용자 자산 데이터의 클라우드 저장 엔드포인트.
 *
 * v2: 더 이상 `user_store` json blob 으로 저장하지 않는다. 각 store 별로
 * 정규화된 도메인 테이블 (InvestmentAccount, SavingsAccount, Debt, ...) 로
 * 번역해서 저장한다. 번역기는 `_translators/` 에 도메인별로 존재.
 *
 * - `GET /api/storage/[key]` — `{ data: envelope | null }` 반환.
 * - `PUT /api/storage/[key]` — `{ data: envelope }` 를 받아 DB row 로 분해/upsert.
 * - `PUT /api/storage/[key]` with `{ data: null }` — 해당 도메인 데이터 전체 삭제.
 *
 * 보안:
 *   - 세션 없으면 401 → 클라이언트가 로그인 화면으로 redirect.
 *   - `key` 는 `CLOUD_STORE_KEYS` 화이트리스트 안에 있어야 한다.
 *   - body 가 2MB 를 넘으면 413.
 */

// 2MB 상한. envelope 번역에서 정규화해 저장하지만 입력 blob 은 여전히 이 크기를 기준으로 거절.
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

  const translator = TRANSLATORS[key];
  const envelope = await translator.read(prisma, userId);

  return Response.json({
    data: envelope,
    updatedAt: null, // v2 에서는 last-write-wins 라 envelope 단위 updatedAt 을 쓰지 않음.
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
  const translator = TRANSLATORS[key];

  // `data: null` 은 "이 store 를 클라우드에서 지우라" 는 시맨틱. 빈 envelope 를
  // 넘겨 stale 삭제 루프가 모든 row 를 지우도록 한다.
  if (data === null) {
    await translator.write(prisma, userId, { state: {}, version: 0 });
    return Response.json({ ok: true });
  }

  // envelope 검증: 반드시 { state, version } 형태여야 한다.
  if (
    !data ||
    typeof data !== "object" ||
    !("state" in data) ||
    !("version" in data) ||
    typeof (data as { version: unknown }).version !== "number"
  ) {
    return badRequest("body.data must be a persist envelope { state, version }");
  }

  const envelope = data as Envelope;
  try {
    await translator.write(prisma, userId, envelope);
  } catch (err) {
    // DB 실패는 500 으로 돌려주고 디버그용 로그.
    console.error(`[api/storage/${key}] write failed`, err);
    return Response.json({ error: "write failed" }, { status: 500 });
  }

  return Response.json({ ok: true });
}
