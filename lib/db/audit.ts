import { prisma } from "@/lib/db/client";

/**
 * Append an admin action to audit_log. Every privileged admin action
 * (approve / unlock / freeze / window toggle) MUST call this.
 */
export async function writeAudit(
  adminId: string,
  action: string,
  target?: string,
  reason?: string
): Promise<void> {
  await prisma.auditLog.create({
    data: { adminId, action, target: target ?? null, reason: reason ?? null },
  });
}
