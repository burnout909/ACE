import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth/token";
import { verifyPin } from "@/lib/auth/pin";
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

  // TODO(Plan 2): enforce isLockedOut() via a persistent failed-attempt store before verifyPin — PIN endpoint is currently unthrottled.
  if (!verifyPin(body.pin ?? "", rater.pinSalt, rater.pinHash)) {
    return NextResponse.json({ error: "bad_pin" }, { status: 401 });
  }

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
