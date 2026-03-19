export type ChecklistQuestion = {
  id: string;
  title: string;
  criteria: string;
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
};

export type Score = 1 | 0;

export type AiEvaluation = {
  questionId: string;
  evidence: string[];
};
