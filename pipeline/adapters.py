"""Thin real ASR/LLM adapters for the transcription pipeline (OpenAI).

Kept deliberately small — all pure logic lives in transcribe.py/evidence.py and
is unit-tested via injected fakes. These adapters only do I/O:
  * OpenAiAsr    — ffmpeg audio extract → /v1/audio/transcriptions (best model,
                   whisper-1 fallback to guarantee segment timestamps).
  * OpenAiEvaluator — /v1/chat/completions evidence+verdict extraction.

No third-party deps: uses stdlib urllib (same approach as lib/openai.ts).
"""
from __future__ import annotations

import json
import os
import subprocess
import tempfile
import urllib.request
import uuid

OPENAI_URL = "https://api.openai.com/v1"
SEGMENT_SECONDS = 300
# Best-accuracy transcription model by default; overridable. whisper-1 is the
# guaranteed-segment-timestamps fallback when the primary returns text-only.
DEFAULT_ASR_MODEL = os.environ.get("ASR_MODEL", "gpt-4o-transcribe")
FALLBACK_ASR_MODEL = "whisper-1"
EVIDENCE_MODEL = os.environ.get("EVIDENCE_MODEL", "gpt-4o")


def _key() -> str:
    k = os.environ.get("OPENAI_KEY")
    if not k:
        raise RuntimeError("OPENAI_KEY not set")
    return k


def _multipart(fields: dict, file_field: str, file_path: str, filename: str) -> tuple[bytes, str]:
    boundary = "----ace" + uuid.uuid4().hex
    nl = b"\r\n"
    body = bytearray()
    for name, value in fields.items():
        body += b"--" + boundary.encode() + nl
        body += f'Content-Disposition: form-data; name="{name}"'.encode() + nl + nl
        body += str(value).encode() + nl
    with open(file_path, "rb") as f:
        data = f.read()
    body += b"--" + boundary.encode() + nl
    body += f'Content-Disposition: form-data; name="{file_field}"; filename="{filename}"'.encode() + nl
    body += b"Content-Type: application/octet-stream" + nl + nl
    body += data + nl
    body += b"--" + boundary.encode() + b"--" + nl
    return bytes(body), boundary


def _post_json(path: str, payload: dict) -> dict:
    req = urllib.request.Request(
        f"{OPENAI_URL}{path}",
        data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {_key()}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=600) as r:
        return json.loads(r.read())


def _transcribe_file(path: str, model: str) -> list[dict] | None:
    """POST one audio file; return raw segments or None if no segment timestamps."""
    body, boundary = _multipart(
        {"model": model, "response_format": "verbose_json", "language": "ko"},
        "file", path, os.path.basename(path),
    )
    req = urllib.request.Request(
        f"{OPENAI_URL}/audio/transcriptions",
        data=body,
        headers={
            "Authorization": f"Bearer {_key()}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            data = json.loads(r.read())
    except urllib.error.HTTPError as e:
        # Model may reject verbose_json (no segments) — signal fallback.
        if model != FALLBACK_ASR_MODEL:
            return None
        raise RuntimeError(f"transcription failed: {e.read().decode()[:300]}")
    segs = data.get("segments")
    if not segs:
        return None
    return [{"start": s.get("start", 0.0), "end": s.get("end", 0.0), "text": s.get("text", "")} for s in segs]


class OpenAiAsr:
    """ffmpeg-extract audio → transcribe in 300s chunks with time offsets."""

    def __init__(self, model: str = DEFAULT_ASR_MODEL):
        self.model = model

    def transcribe(self, audio_path: str) -> list[dict]:
        ffmpeg = os.environ.get("FFMPEG_PATH", "ffmpeg")
        with tempfile.TemporaryDirectory() as td:
            pattern = os.path.join(td, "chunk_%03d.mp3")
            subprocess.run(
                [ffmpeg, "-y", "-i", audio_path, "-vn", "-ac", "1", "-ar", "16000",
                 "-b:a", "64k", "-f", "segment", "-segment_time", str(SEGMENT_SECONDS),
                 "-reset_timestamps", "1", pattern],
                check=True, capture_output=True,
            )
            chunks = sorted(f for f in os.listdir(td) if f.startswith("chunk_"))
            out: list[dict] = []
            for i, name in enumerate(chunks):
                p = os.path.join(td, name)
                segs = _transcribe_file(p, self.model)
                if segs is None:  # primary gave no segments → fallback
                    segs = _transcribe_file(p, FALLBACK_ASR_MODEL)
                offset = i * SEGMENT_SECONDS
                for s in segs or []:
                    out.append({
                        "start": s["start"] + offset,
                        "end": s["end"] + offset,
                        "text": s["text"],
                    })
            return out


class OpenAiEvaluator:
    """Extract per-item evidence quotes + a Yes/No verdict from the transcript."""

    def __init__(self, model: str = EVIDENCE_MODEL):
        self.model = model

    def evaluate(self, checklist: list[dict], transcript: list[dict]) -> list[dict]:
        questions = [{"id": c["id"], "text": c.get("text", ""), "criteria": c.get("criteria", "")} for c in checklist]
        summary = [{"timestamp": s["timestamp"], "text": s["text"]} for s in transcript]
        data = _post_json("/chat/completions", {
            "model": self.model,
            "messages": [
                {"role": "system", "content": "\n".join([
                    "You are a clinical CPX evaluation assistant. Output JSON only.",
                    "For each checklist question, extract supporting evidence quotes from the transcript",
                    "and a Yes/No verdict on whether the item was addressed.",
                    "Do not invent evidence; use only what appears in the transcript. Korean text ok.",
                ])},
                {"role": "user", "content": json.dumps({
                    "instructions": [
                        "Return a JSON array. Each element:",
                        '{"questionId":"<id>","evidence":[{"text":"<quote>","t":<seconds>}],"verdict":"yes"|"no"}',
                        "evidence [] if none. verdict is your objective judgement.",
                    ],
                    "questions": questions,
                    "transcript": summary,
                }, ensure_ascii=False)},
            ],
        })
        content = (data.get("choices") or [{}])[0].get("message", {}).get("content", "[]")
        content = content.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            return []
