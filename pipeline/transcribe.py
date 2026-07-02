"""ASR transcription: provider-agnostic interface + pure normalization.

The ASR provider is hidden behind the `Asr` Protocol so the normalization and
case-bundling logic stays pure and unit-tested; real cloud calls are injected.
Output segments match the app's TranscriptSegment shape
({id,start,end,text,timestamp,speaker}) so they load straight into case_content.
"""
from typing import Protocol

from pipeline.evidence import Evaluator, split_evidence_verdict


class Asr(Protocol):
    def transcribe(self, audio_path: str) -> list[dict]:
        """Return raw segments: {start, end, text, speaker?}."""
        ...


class Diarizer(Protocol):
    def label(self, segments: list[dict]) -> list[dict]:
        """Return per-segment speaker labels: [{id, speaker: 'doctor'|'patient'}]."""
        ...


def label_speakers(segments: list[dict], labels: list[dict]) -> list[dict]:
    """Merge diarization labels into segments by id (pure). Unmatched ids keep
    their existing speaker."""
    by_id = {l["id"]: l.get("speaker") for l in labels}
    return [{**s, "speaker": by_id.get(s["id"], s.get("speaker"))} for s in segments]


def _mmss(sec: float) -> str:
    s = int(sec)
    return f"{s // 60:02d}:{s % 60:02d}"


import re

_HANGUL = re.compile(r"[가-힣]")
_LATIN = re.compile(r"[A-Za-z]")


def drop_hallucinated(segments: list[dict], min_hangul_ratio: float = 0.3) -> list[dict]:
    """Remove segments whose text is mostly non-Korean — a common ASR
    hallucination on non-speech audio (e.g. "Novorepnoye", "schedull"). Segments
    with no letters at all (numbers/punctuation) are kept. Residual Korean-but-
    wrong lines are left for the human correction gate."""
    def keep(text: str) -> bool:
        h = len(_HANGUL.findall(text))
        l = len(_LATIN.findall(text))
        if h + l == 0:
            return True
        return h / (h + l) >= min_hangul_ratio
    return [s for s in segments if keep(s["text"])]


def normalize_segments(raw: list[dict]) -> list[dict]:
    """Convert raw ASR segments to the app TranscriptSegment shape."""
    out = []
    for i, r in enumerate(raw):
        out.append(
            {
                "id": f"seg-{i}",
                "start": float(r["start"]),
                "end": float(r["end"]),
                "text": r["text"].strip(),
                "timestamp": _mmss(float(r["start"])),
                "speaker": r.get("speaker"),
            }
        )
    return out


def transcribe_case(
    case_id: int,
    audio_path: str,
    checklist: list[dict],
    asr: Asr,
    evaluator: Evaluator,
    model_id: str,
    diarizer: "Diarizer | None" = None,
) -> dict:
    """Full per-case bundle: ASR → normalize → (diarize) → LLM evidence → verdict split.

    Returns content ready for case_content (transcript, evidence, frozen=False)
    plus the AI-only verdicts (stored separately in ai_alone). `model_id` records
    the frozen LLM version for reproducibility.
    """
    transcript = drop_hallucinated(normalize_segments(asr.transcribe(audio_path)))
    if diarizer is not None:
        transcript = label_speakers(transcript, diarizer.label(transcript))
    ev, verdicts = split_evidence_verdict(evaluator.evaluate(checklist, transcript))
    return {
        "caseId": case_id,
        "transcript": transcript,
        "evidence": ev,
        "verdicts": verdicts,
        "model_id": model_id,
        "frozen": False,
    }
