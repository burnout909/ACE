import type { TranscriptSegment } from "@/lib/types";

// Per-item Mode-B evidence: a checklist item id + the supporting quote and an
// optional transcript timestamp (seconds). Populated by Plan 4, corrected in
// /admin, then frozen before it is ever served to raters.
export type EvidenceRow = {
  itemId: string;
  quote: string;
  ts?: number;
};

export type CaseContentPayload = {
  transcript: TranscriptSegment[];
  evidence: EvidenceRow[];
};
