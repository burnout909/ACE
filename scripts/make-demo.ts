import { prisma } from "@/lib/db/client";
import { hashPin } from "@/lib/auth/pin";
import { signToken } from "@/lib/auth/token";

// Build an ISOLATED multi-case Mode-A/B preview without touching P1-P4 data.
// Demo cases 995-999 all play local /video1.mp4; Mode-B ones carry a frozen
// copy of a real batch-loaded transcript/evidence so the transcript panel and
// per-item evidence render. Grading one advances to the next → completion.
const DEMO: { caseId: number; mode: "A" | "B"; contentFrom?: number }[] = [
  { caseId: 999, mode: "B", contentFrom: 1 },
  { caseId: 998, mode: "A" },
  { caseId: 997, mode: "B", contentFrom: 2 },
  { caseId: 996, mode: "A" },
  { caseId: 995, mode: "B", contentFrom: 3 },
];

const VIDEO = { ceiling: "/video1.mp4", bed: "/video1.mp4", evaluator: "/video1.mp4" };

async function main() {
  const secret = process.env.SESSION_TOKEN_SECRET!;

  const salt = "salt-DEMO";
  await prisma.rater.upsert({
    where: { id: "DEMO" },
    create: { id: "DEMO", name: "데모 평가자", pinHash: hashPin("123456", salt), pinSalt: salt, scheduleSeed: 0 },
    update: { pinHash: hashPin("123456", salt), pinSalt: salt },
  });
  await prisma.session.upsert({
    where: { raterId_period: { raterId: "DEMO", period: 1 } },
    create: { raterId: "DEMO", period: 1, status: "active" },
    update: { status: "active", windowOpenAt: null, windowCloseAt: null },
  });

  let order = 0;
  for (const spec of DEMO) {
    await prisma.case.upsert({
      where: { id: spec.caseId },
      create: { id: spec.caseId, phenotype: "두통", videoUrls: VIDEO },
      update: { videoUrls: VIDEO },
    });

    if (spec.mode === "B" && spec.contentFrom != null) {
      const src = await prisma.caseContent.findUnique({ where: { caseId: spec.contentFrom } });
      if (!src) throw new Error(`content case ${spec.contentFrom} not loaded yet`);
      await prisma.caseContent.upsert({
        where: { caseId: spec.caseId },
        create: { caseId: spec.caseId, transcript: src.transcript as object, evidence: src.evidence as object, modelId: src.modelId, frozen: true },
        update: { transcript: src.transcript as object, evidence: src.evidence as object, modelId: src.modelId, frozen: true },
      });
    }

    const asg = await prisma.assignment.upsert({
      where: { raterId_caseId_period: { raterId: "DEMO", caseId: spec.caseId, period: 1 } },
      create: { raterId: "DEMO", caseId: spec.caseId, period: 1, mode: spec.mode, orderIndex: order },
      update: { mode: spec.mode, orderIndex: order },
    });
    // Reset progress so the demo can be replayed from the start.
    await prisma.caseProgress.upsert({
      where: { assignmentId: asg.id },
      create: { assignmentId: asg.id, state: "not_started" },
      update: { state: "not_started", submitAt: null, activeMs: 0 },
    });
    order++;
  }

  const token = signToken("DEMO", 1, secret);
  console.log(`DEMO ready: ${DEMO.length} cases (${DEMO.filter(d=>d.mode==='B').length} Mode-B). PIN=123456`);
  console.log("URL path: /g/" + token);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
