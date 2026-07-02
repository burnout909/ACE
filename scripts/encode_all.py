"""Batch-encode all encounters to processed 3-view (or 2-view) with VideoToolbox.

- Encodes every present view of an encounter TOGETHER (single xcorr-synced common
  trim) so angles stay consistent; skips an encounter only when all its target
  views already exist.
- 251111_tue evaluator is excluded (its source is a different date — bad data).
- Resumable: re-run to fill gaps. Per-encounter errors don't abort the batch.

Usage: python -m scripts.encode_all [workers]
"""
import os
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor

import boto3

from pipeline import s3util, sync, encode, config, pairing


# Encoder is configurable so the same script runs on a Mac (VideoToolbox) or an
# EC2 Linux box (libx264 / NVENC). Set VIDEO_ENCODER=libx264|h264_nvenc|h264_videotoolbox.
_ENCODER = os.environ.get("VIDEO_ENCODER", "h264_videotoolbox")


def _codec_args():
    if _ENCODER == "libx264":
        return ["-c:v", "libx264", "-preset", "medium", "-crf", "20"]
    if _ENCODER == "h264_nvenc":
        return ["-c:v", "h264_nvenc", "-preset", "p4", "-b:v", "8M"]
    return ["-c:v", "h264_videotoolbox", "-b:v", "8M"]  # default: Apple VideoToolbox


def vt_cmd(url, out, ss, dur):
    return [
        "ffmpeg", "-nostdin", "-v", "error", "-y",
        # Abort if an HTTP read stalls >30s so a hung S3 stream can't deadlock
        # the batch (it becomes a skippable per-view failure instead).
        "-rw_timeout", "30000000",
        "-ss", str(ss), "-i", url, "-t", str(dur),
        "-map", "0:v:0", "-map", "0:a:0",
        "-vf", "crop=1920:1080", "-r", "30000/1001",
        *_codec_args(), "-movflags", "+faststart",
        "-c:a", "aac", "-b:a", "128k",
        out,
    ]


def target_views(enc):
    views = [v for v in ("ceiling", "bedside", "evaluator") if v in (enc.get("views") or {})]
    if enc["dateFolder"] == "251111_tue" and "evaluator" in views:
        views.remove("evaluator")  # wrong-date source
    return views


def encode_encounter(enc, s3):
    date, trim = enc["dateFolder"], enc["trim"]
    views = target_views(enc)
    if not views:
        return f"{enc['id']}: no usable views"
    if all(encode.exists_with_size(encode.dst_key(date, trim, v), s3=s3) for v in views):
        return f"{enc['id']}: already done, skip"

    urls = {v: s3util.presign(enc["views"][v], s3) for v in views}
    offs = sync.encounter_offsets(urls) if config.REFERENCE_VIEW in urls and len(urls) > 1 else {}

    # Guard: a non-reference view whose audio xcorr confidence is below the
    # threshold is likely mispaired (wrong recording) — skip it rather than
    # silently encode a mismatched angle. Report it for manual review.
    low_conf = [
        v for v in urls
        if v != config.REFERENCE_VIEW
        and offs.get(v, {}).get("confidence", 1.0) < config.SYNC_CONFIDENCE_MIN
    ]
    for v in low_conf:
        del urls[v]
        views = [x for x in views if x != v]
    if not views:
        return f"{enc['id']}: all views low-confidence, skipped (review): {low_conf}"

    offsets = {config.REFERENCE_VIEW: 0.0}
    for v in urls:
        if v != config.REFERENCE_VIEW:
            offsets[v] = offs.get(v, {}).get("offset", 0.0)
    durations = {v: encode.probe_duration(urls[v]) for v in urls}
    starts, common = encode.common_plan(offsets, durations)

    for v in views:
        key = encode.dst_key(date, trim, v)
        with tempfile.TemporaryDirectory() as td:
            out = os.path.join(td, f"{v}.mp4")
            # Backstop timeout: a legit encode streams a multi-GB source, but
            # 30 min is well beyond that; past it, treat as a hang and fail.
            subprocess.run(vt_cmd(urls[v], out, starts[v], common), check=True, timeout=1800)
            encode.upload(out, key, s3=s3)
    conf = {v: round(offs.get(v, {}).get("confidence", 1.0), 2) for v in views if v != config.REFERENCE_VIEW}
    note = f" | SKIPPED low-conf: {low_conf}" if low_conf else ""
    return f"{enc['id']}: encoded {views} ({common:.0f}s, conf={conf}){note}"


def _safe(enc, s3):
    try:
        r = encode_encounter(enc, s3)
        print(r, flush=True)
        return r
    except Exception as exc:
        print(f"FAILED {enc['id']} {exc}", flush=True)
        return None


def main():
    workers = int(sys.argv[1]) if len(sys.argv) > 1 else 2
    s3 = boto3.client("s3", region_name=config.REGION)
    encs, _ = pairing.build_encounters(s3util.list_source_keys(s3))
    date_order = {d: i for i, d in enumerate(config.DATES)}

    def tk(t):
        return tuple(int(p) if str(p).isdigit() else p for p in str(t).split("-"))

    encs.sort(key=lambda e: (date_order.get(e["dateFolder"], 99), tk(e["trim"])))
    print(f"encoding {len(encs)} encounters, workers={workers}", flush=True)
    with ThreadPoolExecutor(max_workers=workers) as ex:
        list(ex.map(lambda e: _safe(e, s3), encs))
    print("ENCODE BATCH DONE", flush=True)


if __name__ == "__main__":
    main()
