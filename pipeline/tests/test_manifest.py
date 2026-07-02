from pipeline.manifest import build_manifest

def test_build_manifest_fills_keys():
    processed = [{
        "id": "251111_tue__trim1", "dateFolder": "251111_tue", "trim": "1",
        "durationSec": 658.0,
        "views": {
            "ceiling": {"offsetAppliedSec": 0.0},
            "bedside": {"offsetAppliedSec": 13.0},
            "evaluator": {"offsetAppliedSec": 22.0},
        },
        "sync": {"method": "audio-xcorr", "confidence": 0.86, "reviewed": False},
        "missingViews": [],
    }]
    m = build_manifest(processed)
    assert m["complaint"] == "두통"
    e = m["encounters"][0]
    assert e["views"]["bedside"]["key"] == "processed/두통/251111_tue/1/bedside.mp4"
    assert e["views"]["bedside"]["offsetAppliedSec"] == 13.0
    assert "video" in m["encoding"]
