from pipeline.encode import build_encode_cmd, dst_key, common_plan

def test_dst_key():
    assert dst_key("251111_tue", "1", "ceiling") == "processed/두통/251111_tue/1/ceiling.mp4"

def test_build_encode_cmd_has_seek_and_encode_args():
    cmd = build_encode_cmd("http://u", "/tmp/o.mp4", start_sec=13.1, dur_sec=600.0)
    assert cmd[0] == "ffmpeg"
    assert "-ss" in cmd and "13.1" in cmd
    assert "-t" in cmd and "600.0" in cmd
    assert "libx264" in cmd and "+faststart" in cmd
    assert cmd[-1] == "/tmp/o.mp4"
    # -ss must come before -i (fast input seek)
    assert cmd.index("-ss") < cmd.index("-i")

def test_common_plan_aligns_to_reference_start():
    # ceiling ref offset 0; bedside starts 13s later; evaluator 22s later.
    offsets = {"ceiling": 0.0, "bedside": 13.0, "evaluator": 22.0}
    durations = {"ceiling": 700.0, "bedside": 690.0, "evaluator": 680.0}
    starts, common = common_plan(offsets, durations)
    assert starts == {"ceiling": 0.0, "bedside": 13.0, "evaluator": 22.0}
    # remaining after each start: 700, 677, 658 -> min 658
    assert abs(common - 658.0) < 1e-6
