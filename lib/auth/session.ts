import { verifyToken } from "@/lib/auth/token";
import { prisma } from "@/lib/db/client";

export type SessionAuth =
  | { ok: true; raterId: string; period: 1 | 2 }
  | { ok: false; status: number; error: string };

/**
 * Verify the sid cookie token AND that the rater's Session for that period
 * is still active (and within its open/close window).
 *
 * Returns { ok:true, raterId, period } on success.
 * Returns { ok:false, status:401 } for missing/invalid token.
 * Returns { ok:false, status:423 } for a valid token whose session is
 *   locked, done, missing, or outside the time window.
 */
export async function authActiveSession(sid: string): Promise<SessionAuth> {
  const claim = verifyToken(sid, process.env.SESSION_TOKEN_SECRET!);
  if (!claim) return { ok: false, status: 401, error: "unauth" };

  const { raterId, period } = claim;

  const session = await prisma.session.findUnique({
    where: { raterId_period: { raterId, period } },
  });

  if (!session || session.status !== "active") {
    return { ok: false, status: 423, error: "session_not_active" };
  }

  const now = new Date();
  if (session.windowOpenAt && now < session.windowOpenAt) {
    return { ok: false, status: 423, error: "session_not_active" };
  }
  if (session.windowCloseAt && now > session.windowCloseAt) {
    return { ok: false, status: 423, error: "session_not_active" };
  }

  return { ok: true, raterId, period };
}
