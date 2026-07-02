import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authAdmin, ADMIN_COOKIE } from "@/lib/auth/admin";
import { writeAudit } from "@/lib/db/audit";
import { prisma } from "@/lib/db/client";
import { s1CompletedAt } from "@/lib/study/s1";
import { isSession2Eligible } from "@/lib/study/eligibility";

type Action = "approve" | "open" | "close";

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const auth = await authAdmin(cookieStore.get(ADMIN_COOKIE)?.value ?? "");
  if (!auth.ok) return NextResponse.json({ error: "unauth" }, { status: auth.status });

  let body: { raterId?: string; action?: Action; force?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const raterId = body.raterId;
  const action: Action = body.action ?? "approve";
  if (!raterId || !["approve", "open", "close"].includes(action)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const session = await prisma.session.findUnique({
    where: { raterId_period: { raterId, period: 2 } },
  });
  if (!session) return NextResponse.json({ error: "no_session" }, { status: 404 });

  const now = new Date();

  if (action === "approve") {
    // Server-side eligibility re-check (defence in depth vs the UI gate).
    const s1rows = await prisma.caseProgress.findMany({
      where: { assignment: { raterId, period: 1 } },
      select: { state: true, submitAt: true },
    });
    const doneAt = s1CompletedAt(s1rows);
    const eligible = isSession2Eligible(doneAt, now.getTime());
    if (!eligible && !body.force) {
      return NextResponse.json(
        { error: "not_eligible", s1CompletedAt: doneAt },
        { status: 409 }
      );
    }
    await prisma.session.update({
      where: { raterId_period: { raterId, period: 2 } },
      data: { status: "active", windowOpenAt: now, windowCloseAt: null },
    });
    await writeAudit(
      auth.adminId,
      body.force && !eligible ? "approve_s2_forced" : "approve_s2",
      `rater:${raterId}`,
      body.force && !eligible ? "washout not elapsed — admin override" : undefined
    );
  } else if (action === "open") {
    await prisma.session.update({
      where: { raterId_period: { raterId, period: 2 } },
      data: { status: "active", windowOpenAt: now, windowCloseAt: null },
    });
    await writeAudit(auth.adminId, "open_s2_window", `rater:${raterId}`);
  } else {
    // close: end the window now (status stays active but access is blocked).
    await prisma.session.update({
      where: { raterId_period: { raterId, period: 2 } },
      data: { windowCloseAt: now },
    });
    await writeAudit(auth.adminId, "close_s2_window", `rater:${raterId}`);
  }

  return NextResponse.json({ ok: true });
}
