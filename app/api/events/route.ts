import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authActiveSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { Prisma } from "@prisma/client";

// ── FIX 4: Allowed event-type taxonomy ───────────────────────────────────────
// Events whose type is not in this set are dropped (not 400'd) so that a
// beacon/keepalive batch with one bad type does not lose the good events.
const ALLOWED_TYPES = new Set([
  "case_enter",
  "case_exit",
  "case_submit",
  "play",
  "pause",
  "seek",
  "ratechange_attempt",
  "section_enter",
  "item_focus",
  "item_decide",
  "item_revise",
  "transcript_reveal",
  "timestamp_jump",
  "evidence_view",
  "idle_start",
  "idle_end",
  "heartbeat",
]);

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const sid = cookieStore.get("sid")?.value ?? "";
  const auth = await authActiveSession(sid);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

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

  // Drop events whose type is not in the allowed taxonomy (beacon-friendly:
  // do not reject the whole batch, just silently discard unknown types).
  const typedEvents = events.filter((e) => ALLOWED_TYPES.has(e.type));

  try {
    // Look up all referenced assignments to get mode and verify ownership (IDOR guard).
    const ids = [
      ...new Set(
        typedEvents
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
    // Unknown/foreign assignmentIds are already dropped here (ownerOf.get → undefined).
    const filtered = typedEvents.filter(
      (e) =>
        e.assignmentId === undefined ||
        typeof e.assignmentId !== "number" ||
        ownerOf.get(e.assignmentId) === auth.raterId
    );

    const rows = filtered.map((e) => ({
      id: e.id,
      raterId: auth.raterId,
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
  } catch {
    // Transient DB error — return 500 so beacon/keepalive clients know to re-queue.
    // Note: unknown/foreign assignmentIds are silently dropped by the IDOR filter
    // above, so FK-violation from a poison batch is not a live risk here.
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
