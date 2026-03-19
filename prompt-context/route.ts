import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { evaluateChecklist } from "@/lib/openai";
import type { ChecklistData, TranscriptSegment } from "@/lib/types";

const evaluationPath = path.join(
  process.cwd(),
  "public",
  "ai",
  "ai-evaluation.json"
);

export async function POST(request: Request) {
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
