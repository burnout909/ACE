"""ASR transcription: provider-agnostic interface + pure normalization.

The ASR provider is hidden behind the `Asr` Protocol so the normalization and
case-bundling logic stays pure and unit-tested; real cloud calls are injected.
Output segments match the app's TranscriptSegment shape
({id,start,end,text,timestamp,speaker}) so they load straight into case_content.
"""
from typing import Protocol


class Asr(Protocol):
    def transcribe(self, audio_path: str) -> list[dict]:
        """Return raw segments: {start, end, text, speaker?}."""
        ...


def _mmss(sec: float) -> str:
    s = int(sec)
    return f"{s // 60:02d}:{s % 60:02d}"


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
