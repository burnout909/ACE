"""Encode ONE encounter's views with VideoToolbox (hardware) — fast path for
the demo / targeted re-encodes. Usage: python -m scripts.encode_one <date> <trim> [views...]
Default views: ceiling bedside (evaluator omitted). Uses audio xcorr sync +
common trim, same as the batch pipeline, but h264_videotoolbox for speed.
"""
import os
import subprocess
import sys
import tempfile

import boto3

from pipeline import s3util, sync, encode, config, pairing


def vt_cmd(url, out, ss, dur):
    return [
        "ffmpeg", "-nostdin", "-v", "error", "-y",
        "-ss", str(ss), "-i", url, "-t", str(dur),
        "-map", "0:v:0", "-map", "0:a:0",
        "-vf", "crop=1920:1080", "-r", "30000/1001",
        "-c:v", "h264_videotoolbox", "-b:v", "8M", "-movflags", "+faststart",
        "-c:a", "aac", "-b:a", "128k",
        out,
    ]


def main():
    date, trim = sys.argv[1], sys.argv[2]
    views = sys.argv[3:] or ["ceiling", "bedside"]
    s3 = boto3.client("s3", region_name=config.REGION)

    encs, _ = pairing.build_encounters(s3util.list_source_keys(s3))
    enc = next(e for e in encs if e["dateFolder"] == date and str(e["trim"]) == str(trim))
    view_urls = {v: s3util.presign(enc["views"][v], s3) for v in views if v in enc["views"]}
    print("views:", list(view_urls))

    offs = sync.encounter_offsets(view_urls)  # non-reference offsets vs ceiling
    offsets = {config.REFERENCE_VIEW: 0.0}
    for v in view_urls:
        if v != config.REFERENCE_VIEW:
            offsets[v] = offs.get(v, {}).get("offset", 0.0)
    print("offsets:", offsets, "conf:", {v: offs.get(v, {}).get("confidence") for v in offs})

    durations = {v: encode.probe_duration(view_urls[v]) for v in view_urls}
    starts, common = encode.common_plan(offsets, durations)
    print(f"common duration: {common:.1f}s")

    for v in view_urls:
        key = encode.dst_key(date, trim, v)
        with tempfile.TemporaryDirectory() as td:
            out = os.path.join(td, f"{v}.mp4")
            subprocess.run(vt_cmd(view_urls[v], out, starts[v], common), check=True)
            encode.upload(out, key, s3=s3)
        print("uploaded", key)
    print("DONE", date, trim)


if __name__ == "__main__":
    main()
