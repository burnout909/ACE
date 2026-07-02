from pipeline.transcribe import normalize_segments, label_speakers, drop_hallucinated


def test_normalize_adds_id_and_mmss_timestamp():
    raw = [
        {"start": 5.0, "end": 8.2, "text": "머리가 아파요", "speaker": "student"},
        {"start": 75.0, "end": 78.0, "text": "언제부터요?", "speaker": "sp"},
    ]
    out = normalize_segments(raw)
    assert out[0]["id"] == "seg-0"
    assert out[0]["timestamp"] == "00:05"
    assert out[1]["timestamp"] == "01:15"
    assert out[1]["speaker"] == "sp"


def test_normalize_strips_text_and_defaults_speaker_none():
    raw = [{"start": 0, "end": 1, "text": "  안녕하세요  "}]
    out = normalize_segments(raw)
    assert out[0]["text"] == "안녕하세요"
    assert out[0]["speaker"] is None
    assert out[0]["timestamp"] == "00:00"


def test_drop_hallucinated_removes_non_korean_gibberish():
    segs = [
        {"id": "seg-0", "text": "Novorepnoye"},   # pure latin gibberish → drop
        {"id": "seg-1", "text": "ormal"},          # drop
        {"id": "seg-2", "text": "안녕하세요"},        # keep
        {"id": "seg-3", "text": "MRI 찍으셨어요?"},  # mostly hangul → keep
        {"id": "seg-4", "text": "네네."},            # keep (punct/hangul)
    ]
    out = drop_hallucinated(segs)
    assert [s["id"] for s in out] == ["seg-2", "seg-3", "seg-4"]


def test_label_speakers_merges_by_id_and_keeps_unlabeled():
    segs = [
        {"id": "seg-0", "text": "머리가 아파요", "speaker": None},
        {"id": "seg-1", "text": "언제부터요?", "speaker": None},
    ]
    out = label_speakers(segs, [{"id": "seg-1", "speaker": "doctor"}])
    assert out[0]["speaker"] is None          # unlabeled kept
    assert out[1]["speaker"] == "doctor"      # labeled applied
    assert out[1]["text"] == "언제부터요?"     # other fields intact
