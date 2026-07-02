import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { prisma } from "@/lib/db/client";

// Admin session cookie name (distinct from rater "sid").
export const ADMIN_COOKIE = "admin_sid";

function mac(payload: string, secret: string): string {
  return bytesToHex(hmac(sha256, utf8ToBytes(secret), utf8ToBytes(payload)));
}

// Signed cookie carrying an admin id. Payload is tagged with role "admin"
// so it can never be mistaken for a rater token (which has {raterId, period}).
export function signAdminToken(adminId: string, secret: string): string {
  const payload = Buffer.from(
    JSON.stringify({ adminId, role: "admin" }),
    "utf8"
  ).toString("base64url");
  return `${payload}.${mac(payload, secret)}`;
}

export function verifyAdminToken(
  token: string,
  secret: string
): { adminId: string } | null {
  const lastDot = token.lastIndexOf(".");
  if (lastDot === -1) return null;
  const payload = token.slice(0, lastDot);
  const sig = token.slice(lastDot + 1);
  if (mac(payload, secret) !== sig) return null;
  try {
    const { adminId, role } = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    );
    if (role !== "admin" || typeof adminId !== "string") return null;
    return { adminId };
  } catch {
    return null;
  }
}

export type AdminAuth =
  | { ok: true; adminId: string }
  | { ok: false; status: number };

/**
 * Verify the admin_sid cookie AND that the admin still exists in the DB.
 * Returns { ok:true, adminId } or { ok:false, status:401 }.
 */
export async function authAdmin(cookieValue: string): Promise<AdminAuth> {
  const claim = verifyAdminToken(cookieValue, process.env.SESSION_TOKEN_SECRET!);
  if (!claim) return { ok: false, status: 401 };
  const admin = await prisma.admin.findUnique({ where: { id: claim.adminId } });
  if (!admin) return { ok: false, status: 401 };
  return { ok: true, adminId: admin.id };
}
