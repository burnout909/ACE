import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import type { TranscriptSegment } from "@/lib/types";
import type { EvidenceRow } from "@/lib/study/content";
import TranscriptEditor from "./TranscriptEditor";

export const dynamic = "force-dynamic";

export default async function TranscriptCasePage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId: raw } = await params;
  const caseId = Number(raw);
  if (!Number.isInteger(caseId)) notFound();

  const [c, content, items] = await Promise.all([
    prisma.case.findUnique({ where: { id: caseId } }),
    prisma.caseContent.findUnique({ where: { caseId } }),
    prisma.checklistItem.findMany({
      orderBy: { ord: "asc" },
      select: { id: true, section: true, text: true },
    }),
  ]);
  if (!c) notFound();

  return (
    <div>
      <Link href="/admin/transcripts" style={{ fontSize: 13 }}>
        ← 케이스 목록
      </Link>
      <h1 style={{ fontSize: 18, margin: "8px 0 16px" }}>케이스 {caseId} 전사문 교정</h1>
      <TranscriptEditor
        caseId={caseId}
        frozen={content?.frozen ?? false}
        initialTranscript={(content?.transcript as TranscriptSegment[]) ?? []}
        initialEvidence={(content?.evidence as EvidenceRow[]) ?? []}
        items={items}
      />
    </div>
  );
}
