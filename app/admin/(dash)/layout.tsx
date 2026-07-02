import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authAdmin, ADMIN_COOKIE } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export default async function AdminDashLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const auth = await authAdmin(cookieStore.get(ADMIN_COOKIE)?.value ?? "");
  if (!auth.ok) redirect("/admin/login");

  const admin = await prisma.admin.findUnique({ where: { id: auth.adminId } });

  return (
    <div style={{ fontFamily: "system-ui", color: "#111" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
          padding: "12px 20px",
          borderBottom: "1px solid #eee",
        }}
      >
        <strong>ACE 백오피스</strong>
        <nav style={{ display: "flex", gap: 16, fontSize: 14 }}>
          <Link href="/admin">진행 매트릭스</Link>
          <Link href="/admin/sessions">Session 2 승인</Link>
        </nav>
        <span style={{ marginLeft: "auto", fontSize: 13, color: "#666" }}>
          {admin?.name}
        </span>
      </header>
      <main style={{ padding: 20 }}>{children}</main>
    </div>
  );
}
