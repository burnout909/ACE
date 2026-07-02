import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authAdmin, ADMIN_COOKIE } from "@/lib/auth/admin";
import { writeAudit } from "@/lib/db/audit";
import { toCsv } from "@/lib/study/export";
import { prisma } from "@/lib/db/client";

const KINDS = ["answers", "progress", "events"] as const;
type Kind = (typeof KINDS)[number];

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : "");

async function build(kind: Kind): Promise<{ headers: string[]; rows: (string | number)[][] }> {
  if (kind === "answers") {
    const rows = await prisma.answer.findMany({
      orderBy: [{ assignmentId: "asc" }, { itemId: "asc" }],
      select: {
        assignmentId: true,
        itemId: true,
        value: true,
        decidedAt: true,
        revisedCount: true,
        assignment: { select: { raterId: true, caseId: true, period: true, mode: true } },
        item: { select: { section: true } },
      },
    });
    return {
      headers: ["assignment_id", "rater_id", "case_id", "period", "mode", "item_id", "section", "value", "decided_at", "revised_count"],
      rows: rows.map((r) => [
        r.assignmentId, r.assignment.raterId, r.assignment.caseId, r.assignment.period,
        r.assignment.mode, r.itemId, r.item.section, r.value, iso(r.decidedAt), r.revisedCount,
      ]),
    };
  }

  if (kind === "progress") {
    const rows = await prisma.caseProgress.findMany({
      orderBy: { assignmentId: "asc" },
      select: {
        assignmentId: true,
        state: true,
        activeMs: true,
        enterAt: true,
        submitAt: true,
        assignment: { select: { raterId: true, caseId: true, period: true, mode: true } },
      },
    });
    return {
      headers: ["assignment_id", "rater_id", "case_id", "period", "mode", "state", "active_ms", "enter_at", "submit_at"],
      rows: rows.map((r) => [
        r.assignmentId, r.assignment.raterId, r.assignment.caseId, r.assignment.period,
        r.assignment.mode, r.state, r.activeMs, iso(r.enterAt), iso(r.submitAt),
      ]),
    };
  }

  // events
  const rows = await prisma.event.findMany({
    orderBy: { serverTs: "asc" },
    select: {
      id: true, raterId: true, assignmentId: true, type: true, section: true,
      mode: true, clientTs: true, serverTs: true, payload: true,
    },
  });
  return {
    headers: ["id", "rater_id", "assignment_id", "type", "section", "mode", "client_ts", "server_ts", "payload"],
    rows: rows.map((r) => [
      r.id, r.raterId, r.assignmentId ?? "", r.type, r.section ?? "", r.mode ?? "",
      iso(r.clientTs), iso(r.serverTs), JSON.stringify(r.payload),
    ]),
  };
}

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const auth = await authAdmin(cookieStore.get(ADMIN_COOKIE)?.value ?? "");
  if (!auth.ok) return NextResponse.json({ error: "unauth" }, { status: auth.status });

  const kind = req.nextUrl.searchParams.get("kind") as Kind | null;
  if (!kind || !KINDS.includes(kind)) {
    return NextResponse.json({ error: "bad_kind" }, { status: 400 });
  }

  const { headers, rows } = await build(kind);
  const csv = toCsv(headers, rows);
  await writeAudit(auth.adminId, "export", `kind:${kind}`, `${rows.length} rows`);

  return new NextResponse("﻿" + csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="ace-${kind}.csv"`,
    },
  });
}
