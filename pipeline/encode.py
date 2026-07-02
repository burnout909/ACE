import subprocess
import boto3
from pipeline import config

def dst_key(date_folder, trim, view):
    return f"{config.DST_PREFIX}/{date_folder}/{trim}/{view}.mp4"

def build_encode_cmd(url, out_path, start_sec, dur_sec):
    return (
        ["ffmpeg", "-nostdin", "-v", "error", "-y",
         "-ss", str(start_sec), "-i", url, "-t", str(dur_sec)]
        + config.FFMPEG_VIDEO_ARGS
        + config.FFMPEG_AUDIO_ARGS
        + [out_path]
    )

def probe_duration(url):
    cmd = ["ffprobe", "-v", "error", "-rw_timeout", "30000000",
           "-show_entries", "format=duration",
           "-of", "default=noprint_wrappers=1:nokey=1", url]
    return float(subprocess.run(cmd, capture_output=True, text=True, check=True, timeout=120).stdout.strip())

def common_plan(offsets, durations):
    """Given per-view start offsets (may be negative) and source durations, return (starts, common_duration).

    Offsets are rebaselined so all per-view starts are >= 0: the minimum offset
    becomes 0 (no trim) and every other view is trimmed by (offset - min_offset).
    This ensures ffmpeg -ss is never negative regardless of which camera started first.
    """
    starts_raw = {v: float(offsets.get(v, 0.0)) for v in durations}
    base = min(starts_raw.values())
    starts = {v: starts_raw[v] - base for v in durations}
    remaining = {v: durations[v] - starts[v] for v in durations}
    common = max(0.0, min(remaining.values()))
    return starts, common

def run_encode(url, out_path, start_sec, dur_sec):
    subprocess.run(build_encode_cmd(url, out_path, start_sec, dur_sec), check=True)

def upload(out_path, key, s3=None):
    s3 = s3 or boto3.client("s3", region_name=config.REGION)
    s3.upload_file(out_path, config.BUCKET, key, ExtraArgs={"ContentType": "video/mp4"})

def exists_with_size(key, min_bytes=1, s3=None):
    s3 = s3 or boto3.client("s3", region_name=config.REGION)
    try:
        h = s3.head_object(Bucket=config.BUCKET, Key=key)
        return h["ContentLength"] >= min_bytes
    except Exception:
        return False
