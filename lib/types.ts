export type { Scale, AnswerValue } from "@/lib/study/scale";

// ── Runtime study types (Task 9) ──────────────────────────────────────────────
export type SectionKey = "Hx" | "PEx" | "Edu";

export type StudyChecklistItem = {
  id: string;
  section: SectionKey;
  scale: import("@/lib/study/scale").Scale;
  text: string;
  criteria: string;
  ord: number;
};

export type CaseVideoUrls = {
  ceiling?: string;
  bed?: string;
  evaluator?: string;
};

// ── Legacy types (kept for files that still import them) ──────────────────────
export type ChecklistQuestion = {
  id: string;
  title: string;
  criteria: string;
  scale: import("@/lib/study/scale").Scale;
};

export type ChecklistTab = {
  id: string;
  label: string;
  questions: ChecklistQuestion[];
};

export type ChecklistData = {
  tabs: ChecklistTab[];
};

export type TranscriptSegment = {
  id: string;
  start: number;
  end: number;
  text: string;
  timestamp: string;
  speaker?: string;
};

export type AiEvaluation = {
  questionId: string;
  evidence: string[];
};
