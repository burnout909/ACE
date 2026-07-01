import { readFileSync } from "fs";
import { join } from "path";
import { prisma } from "@/lib/db/client";
import { buildSchedule } from "@/lib/study/schedule";
import { signToken } from "@/lib/auth/token";
import { hashPin } from "@/lib/auth/pin";

// ── Types ────────────────────────────────────────────────────────────────────

interface ChecklistQuestion {
  id: string;
  title: string;
  criteria: string;
}

interface ChecklistTab {
  id: string;
  label: string;
  questions: ChecklistQuestion[];
}

interface ChecklistJson {
  tabs: ChecklistTab[];
}

// ── Constants ────────────────────────────────────────────────────────────────

const INCLUDE_TABS = new Set(["hx", "pex", "edu"]);
const SECTION_MAP: Record<string, "Hx" | "PEx" | "Edu"> = {
  hx: "Hx",
  pex: "PEx",
  edu: "Edu",
};

const RATERS = [
  { id: "P1", name: "교수1", seed: 101 },
  { id: "P2", name: "교수2", seed: 202 },
  { id: "P3", name: "교수3", seed: 303 },
  { id: "P4", name: "교수4", seed: 404 },
];

const CASE_IDS = Array.from({ length: 30 }, (_, i) => i + 1);

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const secret = process.env.SESSION_TOKEN_SECRET!;
  if (!secret) throw new Error("SESSION_TOKEN_SECRET is not set");

  // ── 1. Checklist items ──────────────────────────────────────────────────
  const checklistPath = join(process.cwd(), "public/checklist.json");
  const checklist: ChecklistJson = JSON.parse(readFileSync(checklistPath, "utf-8"));

  let ord = 0;
  for (const tab of checklist.tabs) {
    if (!INCLUDE_TABS.has(tab.id)) continue;
    const section = SECTION_MAP[tab.id];
    const scale = section === "PEx" ? "triple" : "binary";
    for (const q of tab.questions) {
      await prisma.checklistItem.upsert({
        where: { id: q.id },
        create: { id: q.id, section, scale, text: q.title, criteria: q.criteria, ord },
        update: { section, scale, text: q.title, criteria: q.criteria, ord },
      });
      ord++;
    }
  }
  console.log(`Seeded ${ord} checklist items`);

  // ── 2. Cases ────────────────────────────────────────────────────────────
  const videoUrls = { ceiling: "/video1.mp4", bed: "/video1.mp4", evaluator: "/video1.mp4" };
  for (const id of CASE_IDS) {
    await prisma.case.upsert({
      where: { id },
      create: { id, phenotype: "두통", videoUrls },
      update: { phenotype: "두통", videoUrls },
    });
  }
  console.log(`Seeded ${CASE_IDS.length} cases`);

  // ── 3. Raters, assignments, sessions ───────────────────────────────────
  for (const rater of RATERS) {
    const pin = String(Math.floor(100000 + Math.random() * 900000));
    const salt = `salt-${rater.id}`;
    const pinHash = hashPin(pin, salt);

    await prisma.rater.upsert({
      where: { id: rater.id },
      create: {
        id: rater.id,
        name: rater.name,
        pinHash,
        pinSalt: salt,
        scheduleSeed: rater.seed,
      },
      update: {
        name: rater.name,
        pinHash,
        pinSalt: salt,
        scheduleSeed: rater.seed,
      },
    });

    // Assignments: upsert each of the 60 rows (30 cases × 2 periods)
    const assignments = buildSchedule(CASE_IDS, rater.seed);
    for (const a of assignments) {
      await prisma.assignment.upsert({
        where: {
          raterId_caseId_period: {
            raterId: rater.id,
            caseId: a.caseId,
            period: a.period,
          },
        },
        create: {
          raterId: rater.id,
          caseId: a.caseId,
          period: a.period,
          mode: a.mode,
          orderIndex: a.orderIndex,
        },
        update: {
          mode: a.mode,
          orderIndex: a.orderIndex,
        },
      });
    }

    // Sessions: period 1 = active, period 2 = locked
    for (const period of [1, 2] as const) {
      await prisma.session.upsert({
        where: { raterId_period: { raterId: rater.id, period } },
        create: {
          raterId: rater.id,
          period,
          status: period === 1 ? "active" : "locked",
        },
        update: {
          status: period === 1 ? "active" : "locked",
        },
      });
    }

    const token = signToken(rater.id, 1, secret);
    console.log(`${rater.id}  PIN=${pin}  S1 URL=/g/${token}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
