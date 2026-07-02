import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth/token";
import { prisma } from "@/lib/db/client";
import { Prisma } from "@prisma/client";

async function auth(req: NextRequest) {
  const cookieStore = await cookies();
  const sid = cookieStore.get("sid")?.value ?? "";
  return verifyToken(sid, process.env.SESSION_TOKEN_SECRET!);
}

export async function POST(req: NextRequest) {
  const claim = await auth(req);
  if (!claim) return NextResponse.json({ error: "unauth" }, { status: 401 });

  let events: {
    id: string;
    type: string;
    payload?: Record<string, unknown>;
    clientTs?: string;
    assignmentId?: number;
    section?: string;
  }[];

  try {
    const body = await req.json();
    events = body.events;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  if (!Array.isArray(events)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  // Look up all referenced assignments to get mode and verify ownership (IDOR guard).
  const ids = [
    ...new Set(
      events
        .map((e) => e.assignmentId)
        .filter((x): x is number => typeof x === "number")
    ),
  ];

  const assignments = await prisma.assignment.findMany({
    where: { id: { in: ids } },
    select: { id: true, mode: true, raterId: true },
  });

  const modeOf = new Map(assignments.map((a) => [a.id, a.mode]));
  const ownerOf = new Map(assignments.map((a) => [a.id, a.raterId]));

  // Filter: drop events referencing an assignment that doesn't belong to this rater.
  const filtered = events.filter(
    (e) =>
      e.assignmentId === undefined ||
      typeof e.assignmentId !== "number" ||
      ownerOf.get(e.assignmentId) === claim.raterId
  );

  const rows = filtered.map((e) => ({
    id: e.id,
    raterId: claim.raterId,
    assignmentId: typeof e.assignmentId === "number" ? e.assignmentId : null,
    type: e.type,
    payload: (e.payload ?? {}) as Prisma.InputJsonValue,
    section: e.section ?? null,
    mode:
      typeof e.assignmentId === "number"
        ? (modeOf.get(e.assignmentId) ?? null)
        : null,
    clientTs: e.clientTs ? new Date(e.clientTs) : null,
  }));

  // Idempotent insert: same id (client uuid) → no-op (append-only, dedup by primary key).
  const result = await prisma.event.createMany({
    data: rows,
    skipDuplicates: true,
  });

  return NextResponse.json({ ok: true, stored: result.count });
}
