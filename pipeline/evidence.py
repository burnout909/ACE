"""Checklist evidence mapping + strict verdict separation.

The LLM is hidden behind the `Evaluator` Protocol. Its raw output carries a
per-item {questionId, evidence[], verdict}. `split_evidence_verdict` splits this
into (rater-facing evidence, AI-only verdicts): the rater-facing side MUST NEVER
contain a `verdict` key — study design forbids exposing the AI Yes/No to
evaluators (priming). Verdicts are stored separately (ai_alone).
"""
from typing import Protocol


class Evaluator(Protocol):
    def evaluate(self, checklist: list[dict], transcript: list[dict]) -> list[dict]:
        """Return raw per-item {questionId, evidence[], verdict}."""
        ...


def split_evidence_verdict(raw: list[dict]) -> tuple[list[dict], list[dict]]:
    """Split LLM output into (evidence_for_rater, verdict_for_ai_alone).

    The evidence side is rebuilt from scratch (never spread from `r`) so a stray
    `verdict` key can never leak into rater-facing content.
    """
    evidence, verdicts = [], []
    for r in raw:
        evidence.append({"questionId": r["questionId"], "evidence": r.get("evidence", [])})
        verdicts.append({"questionId": r["questionId"], "verdict": r.get("verdict")})
    return evidence, verdicts
