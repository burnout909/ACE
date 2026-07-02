import argparse, json, os, tempfile
from concurrent.futures import ThreadPoolExecutor
import boto3
from pipeline import config, pairing, sync, encode, manifest, s3util

def process_encounter(enc, overrides, s3):
    view_urls = {v: s3util.presign(k, s3) for v, k in enc["views"].items()}
    # offsets: reference=0; others via xcorr unless overridden.
    # Only call encounter_offsets when the reference view is present; otherwise
    # fall back to empty offs so downstream ov.get/offs.get chains use defaults.
    ov = overrides.get(enc["id"], {})
    if config.REFERENCE_VIEW in view_urls:
        offs = sync.encounter_offsets(view_urls)
    else:
        offs = {}
    offsets = {}
    if config.REFERENCE_VIEW in enc["views"]:
        offsets[config.REFERENCE_VIEW] = 0.0
    conf = 1.0
    for v in enc["views"]:
        if v == config.REFERENCE_VIEW:
            continue
        offsets[v] = ov.get(v, offs.get(v, {}).get("offset", 0.0))
        conf = min(conf, offs.get(v, {}).get("confidence", 0.0))
    durations = {v: encode.probe_duration(view_urls[v]) for v in enc["views"]}
    starts, common = encode.common_plan(offsets, durations)
    for v in enc["views"]:
        key = encode.dst_key(enc["dateFolder"], enc["trim"], v)
        if encode.exists_with_size(key, s3=s3):
            continue
        with tempfile.TemporaryDirectory() as td:
            out = os.path.join(td, f"{v}.mp4")
            encode.run_encode(view_urls[v], out, starts[v], common)
            encode.upload(out, key, s3=s3)
    return {
        "id": enc["id"], "dateFolder": enc["dateFolder"], "trim": enc["trim"],
        "durationSec": round(common, 3),
        "views": {v: {"offsetAppliedSec": round(starts[v], 3)} for v in enc["views"]},
        "sync": {"method": "audio-xcorr", "confidence": round(conf, 3),
                 "reviewed": enc["id"] in overrides},
        "missingViews": enc["missingViews"],
    }

def _safe_process(enc, overrides, s3):
    """Wrapper that catches per-encounter errors so one failure cannot abort the batch."""
    try:
        return process_encounter(enc, overrides, s3)
    except Exception as exc:
        print(f"FAILED {enc['id']} {exc}")
        return {"id": enc["id"], "error": str(exc)}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only-pair", action="store_true")
    ap.add_argument("--workers", type=int, default=2)
    ap.add_argument("--overrides", default=None)
    args = ap.parse_args()

    s3 = boto3.client("s3", region_name=config.REGION)
    keys = s3util.list_source_keys(s3)
    encounters, issues = pairing.build_encounters(keys)
    with open("pairing_report.json", "w") as f:
        json.dump({"issues": issues, "count": len(encounters)},
                  f, ensure_ascii=False, indent=1)
    print(f"encounters={len(encounters)} issues={len(issues)}")
    if args.only_pair:
        return

    if args.overrides:
        with open(args.overrides) as f:
            overrides = json.load(f)
    else:
        overrides = {}
    # only encode encounters that have all views present (skip 2-view for now unless overridden)
    todo = [e for e in encounters if not e["missingViews"] or e["id"] in overrides]

    all_results = []
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        for r in ex.map(lambda e: _safe_process(e, overrides, s3), todo):
            all_results.append(r)
            if "error" not in r:
                print("done", r["id"], "conf=", r["sync"]["confidence"])

    successful = [r for r in all_results if "error" not in r]
    with open("sync_report.json", "w") as f:
        json.dump({e["id"]: e["sync"] for e in successful},
                  f, ensure_ascii=False, indent=1)
    m = manifest.build_manifest(successful)
    s3.put_object(Bucket=config.BUCKET, Key=f"{config.DST_PREFIX}/encounters.json",
                  Body=json.dumps(m, ensure_ascii=False, indent=1).encode(),
                  ContentType="application/json")
    print("manifest uploaded:", f"{config.DST_PREFIX}/encounters.json")

if __name__ == "__main__":
    main()
