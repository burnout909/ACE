import { NextRequest, NextResponse } from "next/server";
import { verifyPin, isLockedOut } from "@/lib/auth/pin";
import { signAdminToken, ADMIN_COOKIE } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/client";

export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const admin = await prisma.admin.findUnique({ where: { email } });

  // Enumeration-safe: same error for unknown email vs wrong password. When the
  // email is unknown we skip the DB write but still return invalid_credentials.
  if (!admin) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  // Brute-force lockout (5 attempts / 10 min), checked BEFORE verifying the
  // password so a locked-out caller cannot probe password correctness.
  const recent = await prisma.adminAttempt.findMany({
    where: { adminId: admin.id, at: { gte: new Date(Date.now() - 10 * 60_000) } },
    select: { at: true },
  });
  if (isLockedOut(recent.map((r) => ({ at: r.at.getTime() })), Date.now())) {
    return NextResponse.json({ error: "locked_out" }, { status: 423 });
  }

  if (!verifyPin(body.password ?? "", admin.passwordSalt, admin.passwordHash)) {
    await prisma.adminAttempt.create({ data: { adminId: admin.id } });
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  // Correct password — clear the failed-attempt counter.
  await prisma.adminAttempt.deleteMany({ where: { adminId: admin.id } });

  const token = signAdminToken(admin.id, process.env.SESSION_TOKEN_SECRET!);
  const res = NextResponse.json({ id: admin.id, name: admin.name });
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return res;
}

// Logout: clear the admin cookie.
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
