import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authAdmin, ADMIN_COOKIE } from "@/lib/auth/admin";
import { writeAudit } from "@/lib/db/audit";
import { prisma } from "@/lib/db/client";
import type { CaseContentPayload } from "@/lib/study/content";

type Action = "save" | "freeze" | "unfreeze";

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const auth = await authAdmin(cookieStore.get(ADMIN_COOKIE)?.value ?? "");
  if (!auth.ok) return NextResponse.json({ error: "unauth" }, { status: auth.status });

  let body: { caseId?: number; action?: Action; content?: CaseContentPayload };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const caseId = Number(body.caseId);
  const action: Action = body.action ?? "save";
  if (!Number.isInteger(caseId) || !["save", "freeze", "unfreeze"].includes(action)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const existing = await prisma.caseContent.findUnique({ where: { caseId } });

  if (action === "save") {
    // Frozen content is immutable — must unfreeze before editing.
    if (existing?.frozen) {
      return NextResponse.json({ error: "frozen" }, { status: 409 });
    }
    const content = body.content ?? { transcript: [], evidence: [] };
    await prisma.caseContent.upsert({
      where: { caseId },
      create: { caseId, transcript: content.transcript, evidence: content.evidence },
      update: { transcript: content.transcript, evidence: content.evidence },
    });
    await writeAudit(auth.adminId, "save_content", `case:${caseId}`);
    return NextResponse.json({ ok: true, frozen: false });
  }

  if (action === "freeze") {
    if (!existing) return NextResponse.json({ error: "no_content" }, { status: 404 });
    await prisma.caseContent.update({ where: { caseId }, data: { frozen: true } });
    await writeAudit(auth.adminId, "freeze_content", `case:${caseId}`);
    return NextResponse.json({ ok: true, frozen: true });
  }

  // unfreeze — reopen for correction
  if (!existing) return NextResponse.json({ error: "no_content" }, { status: 404 });
  await prisma.caseContent.update({ where: { caseId }, data: { frozen: false } });
  await writeAudit(auth.adminId, "unfreeze_content", `case:${caseId}`);
  return NextResponse.json({ ok: true, frozen: false });
}
