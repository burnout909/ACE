export type { Scale, AnswerValue } from "@/lib/study/scale";

export type ChecklistQuestion = {
  id: string;
  title: string;
  criteria: string;
  scale: import("@/lib/study/scale").Scale; // 항목별 척도
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
