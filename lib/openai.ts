import { mkdtemp, readdir, readFile, rm, stat } from "fs/promises";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { formatTimestamp } from "@/lib/time";
import type { ChecklistData, TranscriptSegment, AiEvaluation } from "@/lib/types";

const OPENAI_URL = "https://api.openai.com/v1";
const MAX_UPLOAD_BYTES = 24 * 1024 * 1024;
const SEGMENT_SECONDS = 300;
const TRANSCRIBE_MODEL = "whisper-1";
const TRANSCRIBE_FORMAT = "verbose_json";

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
  let segments: TranscriptSegment[];
  if (fileStats.size <= MAX_UPLOAD_BYTES) {
    segments = await transcribeAudioFile(videoPath, "video1.mp4", "video/mp4", 0);
  } else {
    segments = await transcribeLargeVideo(videoPath);
  }

  return labelSpeakers(segments);
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
  formData.append("language", "ko");

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
    segments?: Array<{
      id: number;
      start: number;
      end: number;
      text: string;
    }>;
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
          timestamp: formatTimestamp(start),
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

async function labelSpeakers(
  segments: TranscriptSegment[]
): Promise<TranscriptSegment[]> {
  if (segments.length === 0) return segments;

  const transcript = segments.map((s) => ({
    id: s.id,
    timestamp: s.timestamp,
    text: s.text,
  }));

  const response = await fetch(`${OPENAI_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: [
            "You are a speaker diarization assistant for medical interviews.",
            "Given a transcript of a doctor-patient conversation, label each segment with the speaker.",
            "Use exactly \"doctor\" or \"patient\" as speaker labels.",
            "Return JSON array only: [{\"id\":\"seg-...\",\"speaker\":\"doctor\"|\"patient\"}]",
            "No other text or explanation.",
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify(transcript),
        },
      ],
    }),
  });

  if (!response.ok) {
    // If labeling fails, return segments without speaker info
    return segments;
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data.choices?.[0]?.message?.content ?? "[]";

  try {
    const labels = JSON.parse(content) as Array<{
      id: string;
      speaker: string;
    }>;
    const speakerMap = new Map(labels.map((l) => [l.id, l.speaker]));
    return segments.map((s) => ({
      ...s,
      speaker: speakerMap.get(s.id) ?? undefined,
    }));
  } catch {
    return segments;
  }
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
          content: [
            "You are a clinical evaluation assistant.",
            "",
            "### 목표",
            "- 체크리스트 질문에 대해 transcript에서 관련 근거(evidence)를 추출한다.",
            "",
            "### 핵심 원칙",
            "- 추론/추측/암시는 금지한다. 객관성을 유지한다.",
            "- evidence는 transcript에 실제로 등장하는 mm:ss 타임스탬프만 사용한다.",
            "",
            "### 출력",
            "- JSON만 출력한다. 다른 텍스트/설명/마크다운은 금지한다.",
            "- 답변 텍스트는 한국어로 작성한다(전문용어는 영어 허용)."
          ].join("\n")
        },
        {
          role: "user",
          content: JSON.stringify({
            instructions: [
              "### 작업 지시",
              "- 아래 questions의 각 항목에 대해 관련 evidence를 추출한다.",
              "- questionId는 입력과 동일하게 유지한다.",
              "",
              "### 증거 형식",
              "- evidence는 transcript에 있는 mm:ss 타임스탬프 문자열 배열이다.",
              "- 증거가 없으면 빈 배열([])을 반환한다.",
              "- 억지로 증거를 만들지 말고 객관성을 지킨다.",
              "",
              "### 출력 형식",
              "- JSON 배열만 출력한다.",
              "- 각 항목 형식: {\"questionId\":\"...\",\"evidence\":[\"mm:ss\",...]}",
              "",
              "### 언어",
              "- 답변 텍스트는 한국어(전문용어 영어 허용)."
            ].join("\n"),
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
