from pipeline import config

def test_views_and_reference():
    assert config.VIEWS == ["ceiling", "bedside", "evaluator"]
    assert config.REFERENCE_VIEW == "ceiling"

def test_view_map_korean_to_key():
    assert config.VIEW_MAP["천장"] == "ceiling"
    assert config.VIEW_MAP["침상"] == "bedside"
    assert config.VIEW_MAP["평가자 시선"] == "evaluator"

def test_encoding_args_present():
    assert "libx264" in config.FFMPEG_VIDEO_ARGS
    assert "+faststart" in config.FFMPEG_VIDEO_ARGS
    assert "crop=1920:1080" in config.FFMPEG_VIDEO_ARGS
