import { prisma } from "@/lib/db/client";
import { hashPin } from "@/lib/auth/pin";
import { signToken } from "@/lib/auth/token";

// Build an ISOLATED Mode-B preview: demo case 999 (local /video1.mp4) carrying
// a copy of case 1's real transcript/evidence (frozen), and a DEMO rater with a
// single Mode-B assignment. Does not touch the P1-P4 study data.
async function main() {
  const secret = process.env.SESSION_TOKEN_SECRET!;
  const DEMO_CASE = 999;

  const src = await prisma.caseContent.findUnique({ where: { caseId: 1 } });
  if (!src) throw new Error("case 1 content not loaded yet");

  await prisma.case.upsert({
    where: { id: DEMO_CASE },
    create: {
      id: DEMO_CASE,
      phenotype: "두통",
      videoUrls: { ceiling: "/video1.mp4", bed: "/video1.mp4", evaluator: "/video1.mp4" },
    },
    update: {
      videoUrls: { ceiling: "/video1.mp4", bed: "/video1.mp4", evaluator: "/video1.mp4" },
    },
  });

  await prisma.caseContent.upsert({
    where: { caseId: DEMO_CASE },
    create: {
      caseId: DEMO_CASE,
      transcript: src.transcript as object,
      evidence: src.evidence as object,
      modelId: src.modelId,
      frozen: true,
    },
    update: {
      transcript: src.transcript as object,
      evidence: src.evidence as object,
      modelId: src.modelId,
      frozen: true,
    },
  });

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

  const asg = await prisma.assignment.upsert({
    where: { raterId_caseId_period: { raterId: "DEMO", caseId: DEMO_CASE, period: 1 } },
    create: { raterId: "DEMO", caseId: DEMO_CASE, period: 1, mode: "B", orderIndex: 0 },
    update: { mode: "B", orderIndex: 0 },
  });
  await prisma.caseProgress.upsert({
    where: { assignmentId: asg.id },
    create: { assignmentId: asg.id, state: "not_started" },
    update: { state: "not_started" },
  });

  const token = signToken("DEMO", 1, secret);
  console.log("DEMO ready. PIN=123456");
  console.log("URL path: /g/" + token);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
