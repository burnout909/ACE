import { NextRequest, NextResponse } from "next/server";
import { verifyPin } from "@/lib/auth/pin";
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

  // Constant-ish response: same error whether the email is unknown or the
  // password is wrong, so it can't be used to enumerate admin accounts.
  if (!admin || !verifyPin(body.password ?? "", admin.passwordSalt, admin.passwordHash)) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

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
