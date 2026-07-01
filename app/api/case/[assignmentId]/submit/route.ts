import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth/token";
import { isValidAnswer, type Scale } from "@/lib/study/scale";
import { prisma } from "@/lib/db/client";

async function auth(req: NextRequest) {
  const cookieStore = await cookies();
  const sid = cookieStore.get("sid")?.value ?? "";
  return verifyToken(sid, process.env.SESSION_TOKEN_SECRET!);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ assignmentId: string }> }
) {
  const claim = await auth(req);
  if (!claim) return NextResponse.json({ error: "unauth" }, { status: 401 });

  let answers: { itemId: string; value: number }[];
  try {
    const body = await req.json();
    answers = body.answers;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const { assignmentId } = await params;
  const a = await prisma.assignment.findUnique({ where: { id: Number(assignmentId) } });
  if (!a || a.raterId !== claim.raterId || a.period !== claim.period) {
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
