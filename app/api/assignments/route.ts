import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth/token";
import { prisma } from "@/lib/db/client";

async function auth(req: NextRequest) {
  const cookieStore = await cookies();
  const sid = cookieStore.get("sid")?.value ?? "";
  return verifyToken(sid, process.env.SESSION_TOKEN_SECRET!);
}

export async function GET(req: NextRequest) {
  const claim = await auth(req);
  if (!claim) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const rows = await prisma.assignment.findMany({
    where: { raterId: claim.raterId, period: claim.period },
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
