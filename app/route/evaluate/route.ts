import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { evaluateChecklist } from "@/lib/openai";
import type { AiEvaluation, ChecklistData, TranscriptSegment } from "@/lib/types";

const evaluationPath = path.join(
  process.cwd(),
  "public",
  "ai",
  "ai-evaluation.json"
);

function normalizeAiAnswer(value: unknown): "Yes" | "No" {
  if (typeof value === "string" && value.toLowerCase() === "yes") {
    return "Yes";
  }
  return "No";
}

function normalizeEvidence(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry) => typeof entry === "string");
}

function normalizeEvaluations(raw: unknown): AiEvaluation[] {
  if (Array.isArray(raw)) {
    return raw
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }
        const data = entry as {
          questionId?: string;
          aiAnswer?: string;
          id?: string;
          answer?: string;
          evidence?: unknown;
        };
        const questionId = data.questionId ?? data.id;
        if (!questionId) {
          return null;
        }
        return {
          questionId,
          aiAnswer: normalizeAiAnswer(data.aiAnswer ?? data.answer),
          evidence: normalizeEvidence(data.evidence)
        } satisfies AiEvaluation;
      })
      .filter((entry): entry is AiEvaluation => Boolean(entry));
  }

  if (!raw || typeof raw !== "object") {
    return [];
  }

  const obj = raw as { evaluations?: unknown; answers?: unknown };
  if (obj.evaluations) {
    return normalizeEvaluations(obj.evaluations);
  }
  if (obj.answers) {
    return normalizeEvaluations(obj.answers);
  }

  return [];
}

async function readStoredEvaluations(): Promise<AiEvaluation[] | null> {
  try {
    const stored = await readFile(evaluationPath, "utf-8");
    const parsed = JSON.parse(stored) as unknown;
    const normalized = normalizeEvaluations(parsed);
    return normalized.length > 0 ? normalized : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const stored = await readStoredEvaluations();
  if (!stored) {
    return NextResponse.json(
      { evaluations: [], error: "No stored evaluation." },
      { status: 404 }
    );
  }
  return NextResponse.json({ evaluations: stored, source: "file" });
}

export async function POST(request: Request) {
  const stored = await readStoredEvaluations();
  if (stored) {
    return NextResponse.json({ evaluations: stored, source: "file" });
  }

  const body = (await request.json()) as {
    checklist?: ChecklistData;
    transcript?: TranscriptSegment[];
  };

  if (!body.checklist || !body.transcript) {
    return NextResponse.json(
      { evaluations: [], error: "Missing checklist or transcript." },
      { status: 400 }
    );
  }

  try {
    const evaluations = await evaluateChecklist(body.checklist, body.transcript);
    const payload = {
      evaluations,
      createdAt: new Date().toISOString()
    };
    await mkdir(path.dirname(evaluationPath), { recursive: true });
    await writeFile(evaluationPath, JSON.stringify(payload, null, 2), "utf-8");
    return NextResponse.json({ evaluations, source: "generated" });
  } catch (error) {
    return NextResponse.json(
      { evaluations: [], error: (error as Error).message },
      { status: 500 }
    );
  }
}
