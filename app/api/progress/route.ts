import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth/token";
import { prisma } from "@/lib/db/client";
import { activeMs } from "@/lib/study/activeTime";

async function auth(_req: NextRequest) {
  const cookieStore = await cookies();
  const sid = cookieStore.get("sid")?.value ?? "";
  return verifyToken(sid, process.env.SESSION_TOKEN_SECRET!);
}

export async function GET(req: NextRequest) {
  const claim = await auth(req);
  if (!claim) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const assignments = await prisma.assignment.findMany({
    where: { raterId: claim.raterId, period: claim.period },
    orderBy: { orderIndex: "asc" },
    select: {
      id: true,
      orderIndex: true,
      progress: { select: { state: true } },
    },
  });

  const total = assignments.length;
  const done = assignments.filter((a) => a.progress?.state === "submitted").length;

  // Recompute activeMs for submitted cases and persist.
  for (const a of assignments) {
    if (a.progress?.state !== "submitted") continue;

    const events = await prisma.event.findMany({
      where: { assignmentId: a.id },
      select: { serverTs: true },
      orderBy: { serverTs: "asc" },
    });

    const computed = activeMs(events.map((e) => ({ serverTs: e.serverTs.getTime() })));

    await prisma.caseProgress.update({
      where: { assignmentId: a.id },
      data: { activeMs: computed },
    });
  }

  return NextResponse.json({
    total,
    done,
    cases: assignments.map((a) => ({
      assignmentId: a.id,
      orderIndex: a.orderIndex,
      state: a.progress?.state ?? "not_started",
    })),
  });
}
