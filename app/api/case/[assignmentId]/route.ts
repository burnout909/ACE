import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth/token";
import { prisma } from "@/lib/db/client";

async function auth(req: NextRequest) {
  const cookieStore = await cookies();
  const sid = cookieStore.get("sid")?.value ?? "";
  return verifyToken(sid, process.env.SESSION_TOKEN_SECRET!);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ assignmentId: string }> }
) {
  const claim = await auth(req);
  if (!claim) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const { assignmentId } = await params;
  const a = await prisma.assignment.findUnique({ where: { id: Number(assignmentId) } });
  if (!a || a.raterId !== claim.raterId || a.period !== claim.period) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const c = await prisma.case.findUnique({ where: { id: a.caseId } });
  const items = await prisma.checklistItem.findMany({ orderBy: { ord: "asc" } });
  const answers = await prisma.answer.findMany({ where: { assignmentId: a.id } });

  const prog = await prisma.caseProgress.findUnique({ where: { assignmentId: a.id } });

  if (prog?.state !== "submitted" && prog?.state !== "locked") {
    await prisma.caseProgress.upsert({
      where: { assignmentId: a.id },
      create: { assignmentId: a.id, state: "in_progress", enterAt: new Date() },
      update: { state: "in_progress", enterAt: new Date() },
    });
  }

  const state = prog?.state === "submitted" || prog?.state === "locked"
    ? prog.state
    : "in_progress";

  return NextResponse.json({ assignment: a, case: c, items, answers, mode: a.mode, state });
}
