from pipeline.load import to_evidence_rows


def test_flattens_pipeline_evidence_to_app_rows():
    ev = [
        {"questionId": "hx1", "evidence": [{"text": "머리가 아파요", "t": 5.0}, {"text": "지끈", "t": 9}]},
        {"questionId": "hx2", "evidence": []},
    ]
    rows = to_evidence_rows(ev)
    assert rows == [
        {"itemId": "hx1", "quote": "머리가 아파요", "ts": 5.0},
        {"itemId": "hx1", "quote": "지끈", "ts": 9},
    ]


def test_tolerates_string_evidence_and_missing_ts():
    ev = [{"questionId": "edu1", "evidence": ["01:15", {"text": "no ts"}]}]
    rows = to_evidence_rows(ev)
    assert rows == [
        {"itemId": "edu1", "quote": "01:15", "ts": None},
        {"itemId": "edu1", "quote": "no ts", "ts": None},
    ]
