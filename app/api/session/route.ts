import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth/token";
import { verifyPin, isLockedOut } from "@/lib/auth/pin";
import { prisma } from "@/lib/db/client";

export async function POST(req: NextRequest) {
  let body: { token?: string; pin?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const claim = verifyToken(body.token ?? "", process.env.SESSION_TOKEN_SECRET!);
  if (!claim) return NextResponse.json({ error: "invalid_token" }, { status: 401 });

  const rater = await prisma.rater.findUnique({ where: { id: claim.raterId } });
  if (!rater) return NextResponse.json({ error: "unknown_rater" }, { status: 401 });

  // Lockout check BEFORE verifying the PIN — a locked-out caller must not be able to probe PIN correctness.
  const recentAttempts = await prisma.pinAttempt.findMany({
    where: { raterId: claim.raterId, at: { gte: new Date(Date.now() - 10 * 60_000) } },
    select: { at: true },
  });
  if (isLockedOut(recentAttempts.map((r) => ({ at: r.at.getTime() })), Date.now())) {
    return NextResponse.json({ error: "locked_out" }, { status: 423 });
  }

  if (!verifyPin(body.pin ?? "", rater.pinSalt, rater.pinHash)) {
    await prisma.pinAttempt.create({ data: { raterId: claim.raterId } });
    return NextResponse.json({ error: "bad_pin" }, { status: 401 });
  }

  // Correct PIN — reset the failed-attempt counter for this rater.
  await prisma.pinAttempt.deleteMany({ where: { raterId: claim.raterId } });

  const session = await prisma.session.findUnique({
    where: { raterId_period: { raterId: claim.raterId, period: claim.period } },
  });
  if (!session || session.status !== "active") {
    return NextResponse.json({ error: "session_not_active" }, { status: 423 });
  }

  const res = NextResponse.json({
    raterId: claim.raterId,
    period: claim.period,
    sessionStatus: session.status,
  });
  res.cookies.set("sid", body.token!, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return res;
}
