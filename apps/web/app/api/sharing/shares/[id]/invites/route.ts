import { db, schema } from "@seedbook/database";
import { desc, eq } from "drizzle-orm";
import { resolveUserId } from "@web/lib/auth-server";
import {
  generateInviteToken,
  INVITE_DEFAULT_TTL_MS,
} from "@web/lib/sharing/generate-invite-token";

/**
 * 특정 공유에 대한 1회용 초대 링크 관리.
 *
 * - `GET`  → 해당 공유의 초대 목록 (소비/만료 여부 포함).
 * - `POST` → 새 초대 토큰 발급. body: `{ label?: string; ttlMs?: number }`
 */

type RouteContext = {
  params: Promise<{ id: string }>;
};

function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

async function ensureOwner(shareId: string, userId: string) {
  const share = await db.query.dataShare.findFirst({
    where: (t, { eq }) => eq(t.id, shareId),
  });
  if (!share || share.ownerUserId !== userId) return null;
  return share;
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  const userId = await resolveUserId(request);
  if (!userId) return unauthorized();

  const share = await ensureOwner(id, userId);
  if (!share) return Response.json({ error: "not found" }, { status: 404 });

  const invites = await db
    .select()
    .from(schema.dataShareInvite)
    .where(eq(schema.dataShareInvite.shareId, id))
    .orderBy(desc(schema.dataShareInvite.createdAt));

  return Response.json({
    invites: invites.map((inv) => ({
      id: inv.id,
      token: inv.token,
      label: inv.label,
      expiresAt: inv.expiresAt.toISOString(),
      consumedAt: inv.consumedAt?.toISOString() ?? null,
      createdAt: inv.createdAt.toISOString(),
    })),
  });
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  const userId = await resolveUserId(request);
  if (!userId) return unauthorized();

  const share = await ensureOwner(id, userId);
  if (!share) return Response.json({ error: "not found" }, { status: 404 });
  if (share.revokedAt !== null) {
    return Response.json({ error: "share revoked" }, { status: 409 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const obj = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

  const rawLabel = obj.label;
  const label =
    typeof rawLabel === "string" && rawLabel.trim().length > 0
      ? rawLabel.trim().slice(0, 50)
      : null;

  const rawTtl = obj.ttlMs;
  const ttlMs =
    typeof rawTtl === "number" && Number.isFinite(rawTtl) && rawTtl > 0
      ? Math.min(rawTtl, 30 * 24 * 60 * 60 * 1000) // 최대 30 일
      : INVITE_DEFAULT_TTL_MS;
  const expiresAt = new Date(Date.now() + ttlMs);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = generateInviteToken();
    try {
      const [invite] = await db
        .insert(schema.dataShareInvite)
        .values({ shareId: id, token, label, expiresAt })
        .returning();
      if (!invite) {
        return Response.json({ error: "failed to create invite" }, { status: 500 });
      }
      return Response.json({
        invite: {
          id: invite.id,
          token: invite.token,
          label: invite.label,
          expiresAt: invite.expiresAt.toISOString(),
          consumedAt: null,
          createdAt: invite.createdAt.toISOString(),
        },
      });
    } catch (err) {
      if (isUniqueViolation(err) && attempt < 2) continue;
      console.error("[api/sharing/shares/[id]/invites] POST failed", err);
      return Response.json({ error: "failed to create invite" }, { status: 500 });
    }
  }
  return Response.json({ error: "failed to create invite" }, { status: 500 });
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "23505"
  );
}
