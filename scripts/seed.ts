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

// Research team admins for /admin backoffice. Passwords are read from env
// (ADMIN_SEED_PASSWORD) at seed time — never hard-coded. Re-running never
// rotates an existing admin's password (mirrors rater PIN behaviour).
const ADMINS = [
  { id: "A1", name: "송지우", email: "songjiwoo@example.com" },
  { id: "A2", name: "김민성", email: "ishs24ys@gmail.com" },
];

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
    // Check if rater already exists to avoid rotating PINs on re-run
    const existing = await prisma.rater.findUnique({ where: { id: rater.id } });

    // Generate PIN only for new raters
    let pin: string;
    let salt: string;
    let pinHash: string;

    if (!existing) {
      pin = String(Math.floor(100000 + Math.random() * 900000));
      salt = `salt-${rater.id}`;
      pinHash = hashPin(pin, salt);
    } else {
      pin = "";
      salt = "";
      pinHash = "";
    }

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
    if (!existing) {
      console.log(`${rater.id}  PIN=${pin}  S1 URL=/g/${token}`);
    } else {
      console.log(`${rater.id}  (기존 rater — PIN 유지, 재출력 안 함)  S1 URL=/g/${token}`);
    }
  }

  // ── 4. Admins ───────────────────────────────────────────────────────────
  const adminPassword = process.env.ADMIN_SEED_PASSWORD;
  for (const a of ADMINS) {
    const existing = await prisma.admin.findUnique({ where: { id: a.id } });
    if (existing) {
      // Never rotate an existing admin's password; only refresh name/email.
      await prisma.admin.update({
        where: { id: a.id },
        data: { name: a.name, email: a.email.toLowerCase() },
      });
      console.log(`${a.id}  ${a.name}  (기존 admin — 비밀번호 유지)`);
      continue;
    }
    if (!adminPassword) {
      throw new Error(
        `ADMIN_SEED_PASSWORD is not set — required to seed new admin ${a.id}`
      );
    }
    const salt = `salt-${a.id}`;
    await prisma.admin.create({
      data: {
        id: a.id,
        name: a.name,
        email: a.email.toLowerCase(),
        passwordSalt: salt,
        passwordHash: hashPin(adminPassword, salt),
      },
    });
    console.log(`${a.id}  ${a.name}  ${a.email}  (비밀번호=ADMIN_SEED_PASSWORD)`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
