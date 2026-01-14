import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { transcribeVideo } from "@/lib/openai";
import type { TranscriptSegment } from "@/lib/types";

const transcriptPath = path.join(
  process.cwd(),
  "public",
  "transcript",
  "transcript.json"
);

export async function GET() {
  try {
    const stored = await readFile(transcriptPath, "utf-8");
    const parsed = JSON.parse(stored) as
      | { segments?: TranscriptSegment[] }
      | TranscriptSegment[];
    const segments = Array.isArray(parsed) ? parsed : parsed.segments ?? [];
    if (segments.length > 0) {
      return NextResponse.json({
        segments,
        source: "file"
      });
    }
  } catch {
    // Falls through to generate transcript
  }

  const videoPath = path.join(process.cwd(), "public", "video1.mp4");
  const segments = await transcribeVideo(videoPath);
  const payload = {
    segments,
    createdAt: new Date().toISOString()
  };

  await mkdir(path.dirname(transcriptPath), { recursive: true });
  await writeFile(transcriptPath, JSON.stringify(payload, null, 2), "utf-8");

  return NextResponse.json(payload);
}
