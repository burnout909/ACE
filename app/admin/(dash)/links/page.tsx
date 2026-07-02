import { headers } from "next/headers";
import { prisma } from "@/lib/db/client";
import { signToken } from "@/lib/auth/token";
import RaterLinks, { type RaterLink } from "./RaterLinks";

export const dynamic = "force-dynamic";

export default async function LinksPage() {
  const secret = process.env.SESSION_TOKEN_SECRET!;
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host") ?? "localhost:3000";
  const origin = `${proto}://${host}`;

  const raters = await prisma.rater.findMany({
    select: { id: true, name: true },
    orderBy: { id: "asc" },
  });

  const rows: RaterLink[] = raters.map((r) => ({
    raterId: r.id,
    name: r.name,
    s1: `${origin}/g/${signToken(r.id, 1, secret)}`,
    s2: `${origin}/g/${signToken(r.id, 2, secret)}`,
  }));

  return (
    <div>
      <h1 style={{ fontSize: 18, marginBottom: 4 }}>평가자 접속 링크</h1>
      <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 16 }}>
        각 평가자의 세션별 토큰 URL. 평가자는 이 링크 + 개인 PIN으로 접속합니다. S2는 관리자 승인(활성화) 후에만 열립니다.
        링크는 시크릿으로 서명되어 위변조 불가.
      </p>
      <RaterLinks rows={rows} />
    </div>
  );
}
