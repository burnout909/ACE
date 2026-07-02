import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authActiveSession } from "@/lib/auth/session";
import { isValidAnswer, type Scale } from "@/lib/study/scale";
import { prisma } from "@/lib/db/client";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ assignmentId: string }> }
) {
  const cookieStore = await cookies();
  const sid = cookieStore.get("sid")?.value ?? "";
  const auth = await authActiveSession(sid);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let answers: { itemId: string; value: number }[];
  try {
    const body = await req.json();
    answers = body.answers;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  if (!Array.isArray(answers)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const { assignmentId } = await params;
  const id = Number(assignmentId);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const a = await prisma.assignment.findUnique({ where: { id } });
  if (!a || a.raterId !== auth.raterId || a.period !== auth.period) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const prog = await prisma.caseProgress.findUnique({ where: { assignmentId: a.id } });
  if (prog?.state === "submitted" || prog?.state === "locked") {
    return NextResponse.json({ error: "already_submitted" }, { status: 409 });
  }

  const items = await prisma.checklistItem.findMany({ select: { id: true, scale: true } });
  const scaleMap = new Map<string, Scale>(items.map((item) => [item.id, item.scale as Scale]));

  for (const { itemId, value } of answers) {
    const scale = scaleMap.get(itemId);
    if (scale === undefined || !isValidAnswer(scale, value)) {
      return NextResponse.json({ error: "invalid_answer", itemId }, { status: 400 });
    }
  }

  // Fix A: require every checklist item to have a submitted answer before locking.
  const submittedIds = new Set(answers.map((a) => a.itemId));
  const missingIds = items.map((i) => i.id).filter((id) => !submittedIds.has(id));
  if (missingIds.length > 0) {
    return NextResponse.json(
      { error: "incomplete_submission", missing: missingIds },
      { status: 400 }
    );
  }

  await prisma.$transaction([
    ...answers.map((x) =>
      prisma.answer.upsert({
        where: { assignmentId_itemId: { assignmentId: a.id, itemId: x.itemId } },
        create: { assignmentId: a.id, itemId: x.itemId, value: x.value },
        update: { value: x.value, decidedAt: new Date() },
      })
    ),
    prisma.caseProgress.upsert({
      where: { assignmentId: a.id },
      create: { assignmentId: a.id, state: "submitted", submitAt: new Date() },
      update: { state: "submitted", submitAt: new Date() },
    }),
  ]);

  return NextResponse.json({ ok: true, state: "submitted" });
}
