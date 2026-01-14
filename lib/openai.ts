import { mkdtemp, readdir, readFile, rm, stat } from "fs/promises";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { formatTimestamp } from "@/lib/time";
import type { ChecklistData, TranscriptSegment, AiEvaluation } from "@/lib/types";

const OPENAI_URL = "https://api.openai.com/v1";
const MAX_UPLOAD_BYTES = 24 * 1024 * 1024;
const SEGMENT_SECONDS = 300;
const TRANSCRIBE_MODEL = "gpt-4o-transcribe";
const TRANSCRIBE_FORMAT = "json";

const fillerRegex =
  /\b(um+|uh+|erm+|hmm+|like|you know|sort of|kind of|ah+|eh+)\b/gi;
const bracketNoiseRegex = /\[(.*?)\]/g;
const koreanFillersRegex = /(어+|음+|저기|그냥|뭐|그래서|그리고)/g;

export function cleanTranscriptText(text: string): string {
  return text
    .replace(bracketNoiseRegex, " ")
    .replace(fillerRegex, " ")
    .replace(koreanFillersRegex, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function transcribeVideo(
  videoPath: string
): Promise<TranscriptSegment[]> {
  if (!process.env.OPENAI_KEY) {
    throw new Error("Missing OPENAI_KEY environment variable.");
  }

  const fileStats = await stat(videoPath);
  if (fileStats.size <= MAX_UPLOAD_BYTES) {
    return transcribeAudioFile(videoPath, "video1.mp4", "video/mp4", 0);
  }

  return transcribeLargeVideo(videoPath);
}

async function transcribeAudioFile(
  filePath: string,
  fileName: string,
  mimeType: string,
  offsetSeconds: number
): Promise<TranscriptSegment[]> {
  const buffer = await readFile(filePath);
  const fileObject =
    typeof File !== "undefined"
      ? new File([buffer], fileName, { type: mimeType })
      : new Blob([buffer], { type: mimeType });
  const formData = new FormData();
  formData.append("file", fileObject, fileName);
  formData.append("model", TRANSCRIBE_MODEL);
  formData.append("response_format", TRANSCRIBE_FORMAT);

  const response = await fetch(`${OPENAI_URL}/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_KEY}`
    },
    body: formData
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Transcription failed: ${errorText}`);
  }

  const data = (await response.json()) as {
    segments?: Array<{ start: number; end: number; text: string }>;
    text?: string;
  };

  if (data.segments && data.segments.length > 0) {
    return data.segments
      .map((segment, index) => {
        const cleaned = cleanTranscriptText(segment.text ?? "");
        const start = (segment.start ?? 0) + offsetSeconds;
        const end = (segment.end ?? segment.start ?? 0) + offsetSeconds;
        return {
          id: `seg-${offsetSeconds}-${index}`,
          start,
          end,
          text: cleaned,
          timestamp: formatTimestamp(start)
        } satisfies TranscriptSegment;
      })
      .filter((segment) => segment.text.length > 0);
  }

  const cleanedText = cleanTranscriptText(data.text ?? "");
  if (!cleanedText) {
    return [];
  }
  const durationSeconds =
    (await getMediaDurationSeconds(filePath)) ?? SEGMENT_SECONDS;
  return buildApproxSegments(cleanedText, offsetSeconds, durationSeconds);
}

async function transcribeLargeVideo(
  videoPath: string
): Promise<TranscriptSegment[]> {
  const ffmpegPath = process.env.FFMPEG_PATH ?? "ffmpeg";
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ace-audio-"));
  const outputPattern = path.join(tempDir, "chunk_%03d.mp3");
  try {
    try {
      await runFfmpeg(ffmpegPath, [
        "-y",
        "-i",
        videoPath,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-b:a",
        "64k",
        "-f",
        "segment",
        "-segment_time",
        `${SEGMENT_SECONDS}`,
        "-reset_timestamps",
        "1",
        outputPattern
      ]);
    } catch (error) {
      throw new Error(
        `Transcription requires ffmpeg for large videos. ${String(
          (error as Error).message || error
        )}`
      );
    }

    const chunkFiles = (await readdir(tempDir))
      .filter((name) => name.startsWith("chunk_") && name.endsWith(".mp3"))
      .sort()
      .map((name) => path.join(tempDir, name));

    const combined: TranscriptSegment[] = [];
    for (let index = 0; index < chunkFiles.length; index += 1) {
      const offsetSeconds = index * SEGMENT_SECONDS;
      const segmentResults = await transcribeAudioFile(
        chunkFiles[index],
        `chunk_${index}.mp3`,
        "audio/mpeg",
        offsetSeconds
      );
      combined.push(...segmentResults);
    }

    return combined;
  } catch (error) {
    throw error;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function runFfmpeg(ffmpegPath: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stderr = "";

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          stderr.trim() || `ffmpeg exited with code ${code ?? "unknown"}`
        )
      );
    });
  });
}

async function getMediaDurationSeconds(
  filePath: string
): Promise<number | null> {
  const ffprobePath = process.env.FFPROBE_PATH ?? "ffprobe";
  return new Promise((resolve) => {
    const child = spawn(
      ffprobePath,
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath
      ],
      { stdio: ["ignore", "pipe", "ignore"] }
    );
    let output = "";
    child.stdout.on("data", (data) => {
      output += data.toString();
    });
    child.on("error", () => resolve(null));
    child.on("close", (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }
      const value = Number.parseFloat(output.trim());
      resolve(Number.isFinite(value) ? value : null);
    });
  });
}

function buildApproxSegments(
  text: string,
  offsetSeconds: number,
  durationSeconds: number
): TranscriptSegment[] {
  const parts = text
    .split(/[.!?]\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const segments = parts.length > 0 ? parts : [text];
  const totalChars = segments.reduce((sum, part) => sum + part.length, 0);
  let cursor = offsetSeconds;

  return segments.map((segmentText, index) => {
    const share =
      totalChars > 0 ? segmentText.length / totalChars : 1 / segments.length;
    const segmentDuration = Math.max(
      1,
      Math.round(durationSeconds * share)
    );
    const start = cursor;
    const end =
      index === segments.length - 1
        ? offsetSeconds + durationSeconds
        : Math.min(offsetSeconds + durationSeconds, cursor + segmentDuration);
    cursor = end;
    return {
      id: `seg-${offsetSeconds}-${index}`,
      start,
      end,
      text: segmentText,
      timestamp: formatTimestamp(start)
    };
  });
}

export async function evaluateChecklist(
  checklist: ChecklistData,
  transcript: TranscriptSegment[]
): Promise<AiEvaluation[]> {
  if (!process.env.OPENAI_KEY) {
    throw new Error("Missing OPENAI_KEY environment variable.");
  }

  const questionList = checklist.tabs.flatMap((tab) =>
    tab.questions.map((question) => ({
      id: question.id,
      title: question.title,
      criteria: question.criteria
    }))
  );

  const transcriptSummary = transcript.map((segment) => ({
    timestamp: segment.timestamp,
    text: segment.text
  }));

  const response = await fetch(`${OPENAI_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content:
            "You are a clinical evaluation assistant. Use the transcript to answer each checklist question. Respond with JSON only."
        },
        {
          role: "user",
          content: JSON.stringify({
            instructions:
              "For each question, return Yes or No, and list evidence timestamps in mm:ss from the transcript. If there is no evidence, answer No with an empty evidence array.",
            questions: questionList,
            transcript: transcriptSummary
          })
        }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Evaluation failed: ${errorText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data.choices?.[0]?.message?.content ?? "[]";

  try {
    const parsed = JSON.parse(content) as AiEvaluation[];
    return parsed;
  } catch {
    return [];
  }
}
