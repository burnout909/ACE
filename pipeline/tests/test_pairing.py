from pipeline.pairing import parse_key, build_encounters

def test_parse_key_basic():
    k = "두통/천장/251111_tue/DJI_20251111132039_0039_D - Trim1.mp4"
    p = parse_key(k)
    assert p == {"view": "ceiling", "dateFolder": "251111_tue",
                 "trim": "1", "name": "DJI_20251111132039_0039_D - Trim1.mp4"}

def test_parse_key_split_trim():
    k = "두통/평가자 시선/251216_tue/DJI_x - Trim5-1.mp4"
    p = parse_key(k)
    assert p["view"] == "evaluator" and p["trim"] == "5-1"

def test_parse_key_ignores_non_mp4_and_raw():
    assert parse_key("두통/천장/251111_tue/raw/") is None
    assert parse_key("두통/천장/251111_tue/notes.txt") is None

def test_build_encounters_full_triplet():
    keys = [
        "두통/천장/251111_tue/DJI_a - Trim1.mp4",
        "두통/침상/251111_tue/DJI_b - Trim1.mp4",
        "두통/평가자 시선/251111_tue/DJI_c - Trim1.mp4",
    ]
    enc, issues = build_encounters(keys)
    assert len(enc) == 1
    e = enc[0]
    assert e["id"] == "251111_tue__trim1"
    assert set(e["views"].keys()) == {"ceiling", "bedside", "evaluator"}
    assert e["missingViews"] == []
    assert issues == []

def test_build_encounters_missing_view_flagged():
    keys = [
        "두통/천장/251216_tue/DJI_a - Trim9.mp4",
        "두통/침상/251216_tue/DJI_b - Trim9.mp4",
        # evaluator missing
    ]
    enc, issues = build_encounters(keys)
    assert enc[0]["missingViews"] == ["evaluator"]
    assert issues == [{"dateFolder": "251216_tue", "trim": "9", "missingViews": ["evaluator"]}]
