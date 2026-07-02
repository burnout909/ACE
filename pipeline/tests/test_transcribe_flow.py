from pipeline.transcribe import transcribe_case


class FakeAsr:
    def transcribe(self, p):
        return [{"start": 5.0, "end": 8.0, "text": "머리가 아파요", "speaker": "student"}]


class FakeEval:
    def evaluate(self, c, t):
        return [
            {"questionId": "hx1", "evidence": [{"text": "머리가 아파요", "t": 5.0}], "verdict": "yes"}
        ]


def test_transcribe_case_bundles_content_without_verdict_in_evidence():
    out = transcribe_case(3, "a.wav", [{"id": "hx1"}], FakeAsr(), FakeEval(), "clova-x-2026-06")
    assert out["caseId"] == 3 and out["frozen"] is False
    assert out["model_id"] == "clova-x-2026-06"
    assert "verdict" not in out["evidence"][0]
    assert out["verdicts"][0]["verdict"] == "yes"
    assert out["transcript"][0]["timestamp"] == "00:05"
