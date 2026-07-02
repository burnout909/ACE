from pipeline.evidence import split_evidence_verdict


def test_split_strips_verdict_from_rater_evidence():
    raw = [
        {"questionId": "hx1", "evidence": [{"text": "머리가 아파요", "t": 5.0}], "verdict": "yes"}
    ]
    ev, verdicts = split_evidence_verdict(raw)
    assert ev == [{"questionId": "hx1", "evidence": [{"text": "머리가 아파요", "t": 5.0}]}]
    assert "verdict" not in ev[0]
    assert verdicts == [{"questionId": "hx1", "verdict": "yes"}]


def test_split_defaults_missing_evidence_and_verdict():
    raw = [{"questionId": "pex2"}]
    ev, verdicts = split_evidence_verdict(raw)
    assert ev == [{"questionId": "pex2", "evidence": []}]
    assert "verdict" not in ev[0]
    assert verdicts == [{"questionId": "pex2", "verdict": None}]
