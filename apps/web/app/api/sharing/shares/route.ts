import { prisma } from "@seedbook/database";
import { resolveUserId } from "@web/lib/auth-server";
import { generateShareCode } from "@web/lib/sharing/authz";

/**
 * 현재 로그인한 사용자(=소유자) 의 데이터 공유 관리 엔드포인트.
 *
 * - `GET`  → 내가 만든 공유 목록 + 각 공유의 수락자 목록 반환.
 * - `POST` → 새 공유(코드) 생성.
 */

function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

export async function GET(request: Request): Promise<Response> {
  const userId = await resolveUserId(request);
  if (!userId) return unauthorized();

  const shares = await prisma.dataShare.findMany({
    where: { ownerUserId: userId },
    include: {
      acceptances: {
        include: {
          recipient: { select: { id: true, name: true, image: true } },
        },
        orderBy: { acceptedAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return Response.json({
    shares: shares.map((s) => ({
      id: s.id,
      code: s.code,
      label: s.label,
      revokedAt: s.revokedAt?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
      acceptances: s.acceptances.map((a) => ({
        id: a.id,
        acceptedAt: a.acceptedAt.toISOString(),
        recipient: {
          id: a.recipient.id,
          name: a.recipient.name,
          image: a.recipient.image,
        },
      })),
    })),
  });
}

export async function POST(request: Request): Promise<Response> {
  const userId = await resolveUserId(request);
  if (!userId) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const rawLabel =
    body && typeof body === "object" && "label" in body
      ? (body as { label: unknown }).label
      : undefined;
  const label =
    typeof rawLabel === "string" && rawLabel.trim().length > 0
      ? rawLabel.trim().slice(0, 50)
      : null;

  // 코드 충돌 가능성은 극히 낮지만 3 회까지 재시도한다.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = generateShareCode();
    try {
      const share = await prisma.dataShare.create({
        data: { ownerUserId: userId, code, label },
      });
      return Response.json({
        share: {
          id: share.id,
          code: share.code,
          label: share.label,
          revokedAt: null,
          createdAt: share.createdAt.toISOString(),
          acceptances: [],
        },
      });
    } catch (err) {
      // unique violation 이면 재시도, 그 외는 500
      if (isUniqueViolation(err) && attempt < 2) continue;
      console.error("[api/sharing/shares] POST failed", err);
      return Response.json({ error: "failed to create share" }, { status: 500 });
    }
  }
  return Response.json({ error: "failed to create share" }, { status: 500 });
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "P2002"
  );
}
