import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authActiveSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ assignmentId: string }> }
) {
  const cookieStore = await cookies();
  const sid = cookieStore.get("sid")?.value ?? "";
  const auth = await authActiveSession(sid);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { assignmentId } = await params;
  const id = Number(assignmentId);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const a = await prisma.assignment.findUnique({ where: { id } });
  if (!a || a.raterId !== auth.raterId || a.period !== auth.period) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const [c, items, answers] = await Promise.all([
    prisma.case.findUnique({ where: { id: a.caseId } }),
    prisma.checklistItem.findMany({ orderBy: { ord: "asc" } }),
    prisma.answer.findMany({ where: { assignmentId: a.id } }),
  ]);

  const prog = await prisma.caseProgress.findUnique({ where: { assignmentId: a.id } });

  if (prog?.state !== "submitted" && prog?.state !== "locked") {
    await prisma.caseProgress.upsert({
      where: { assignmentId: a.id },
      create: { assignmentId: a.id, state: "in_progress", enterAt: new Date() },
      update: { state: "in_progress" },
    });
  }

  const state = prog?.state === "submitted" || prog?.state === "locked"
    ? prog.state
    : "in_progress";

  // Mode B serves transcript + evidence — but ONLY once the content is frozen
  // (admin-reviewed). Unfrozen or Mode A → empty, so unfinished/uncorrected
  // content is never exposed to raters.
  let transcript: unknown[] = [];
  let evidence: unknown[] = [];
  if (a.mode === "B") {
    const content = await prisma.caseContent.findUnique({ where: { caseId: a.caseId } });
    if (content?.frozen) {
      transcript = content.transcript as unknown[];
      evidence = content.evidence as unknown[];
    }
  }

  return NextResponse.json({ assignment: a, case: c, items, answers, mode: a.mode, state, transcript, evidence });
}
