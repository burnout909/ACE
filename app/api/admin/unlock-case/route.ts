import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authAdmin, ADMIN_COOKIE } from "@/lib/auth/admin";
import { writeAudit } from "@/lib/db/audit";
import { prisma } from "@/lib/db/client";

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const auth = await authAdmin(cookieStore.get(ADMIN_COOKIE)?.value ?? "");
  if (!auth.ok) return NextResponse.json({ error: "unauth" }, { status: auth.status });

  let body: { assignmentId?: number; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const assignmentId = Number(body.assignmentId);
  const reason = (body.reason ?? "").trim();
  if (!Number.isInteger(assignmentId) || reason.length === 0) {
    return NextResponse.json({ error: "reason_required" }, { status: 400 });
  }

  const prog = await prisma.caseProgress.findUnique({ where: { assignmentId } });
  if (!prog) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Only a submitted case can be reopened. (locked = admin-frozen; leave it.)
  if (prog.state !== "submitted") {
    return NextResponse.json({ error: "not_submitted", state: prog.state }, { status: 409 });
  }

  await prisma.caseProgress.update({
    where: { assignmentId },
    data: { state: "in_progress" },
  });
  await writeAudit(auth.adminId, "unlock_case", `assignment:${assignmentId}`, reason);

  return NextResponse.json({ ok: true });
}
