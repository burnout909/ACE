import json
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
    cmd = ["ffprobe", "-v", "error", "-show_entries", "format=duration",
           "-of", "default=noprint_wrappers=1:nokey=1", url]
    return float(subprocess.run(cmd, capture_output=True, text=True, check=True).stdout.strip())

def common_plan(offsets, durations):
    """Given per-view start offsets and source durations, return (starts, common_duration)."""
    starts = {v: float(offsets.get(v, 0.0)) for v in durations}
    remaining = {v: durations[v] - starts[v] for v in durations}
    common = min(remaining.values())
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
