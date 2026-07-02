import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authActiveSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const sid = cookieStore.get("sid")?.value ?? "";
  const auth = await authActiveSession(sid);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const rows = await prisma.assignment.findMany({
    where: { raterId: auth.raterId, period: auth.period },
    orderBy: { orderIndex: "asc" },
    select: {
      id: true,
      caseId: true,
      orderIndex: true,
      mode: true,
      progress: { select: { state: true } },
    },
  });

  return NextResponse.json({
    assignments: rows.map((r) => ({
      id: r.id,
      caseId: r.caseId,
      orderIndex: r.orderIndex,
      mode: r.mode,
      state: r.progress?.state ?? "not_started",
    })),
  });
}
