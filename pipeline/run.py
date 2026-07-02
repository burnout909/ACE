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

def transcribe_main(args):
    """Plan 4: transcribe cases → evidence/verdict → DB (frozen=false).

    --cases-file: JSON [{"caseId":1,"audio":"/path/or/url"}, ...].
    Runs cases in parallel; each bundle is loaded into case_content + ai_alone
    unless --dry-run (writes transcribe_report.json instead).
    """
    from pipeline.transcribe import transcribe_case
    from pipeline.adapters import OpenAiAsr, OpenAiEvaluator, DEFAULT_ASR_MODEL, EVIDENCE_MODEL
    from pipeline import load

    with open(args.cases_file) as f:
        cases = json.load(f)
    checklist = load.fetch_checklist()
    asr, evaluator = OpenAiAsr(), OpenAiEvaluator()
    model_id = args.model_id or f"{DEFAULT_ASR_MODEL}+{EVIDENCE_MODEL}"

    def one(c):
        try:
            bundle = transcribe_case(c["caseId"], c["audio"], checklist, asr, evaluator, model_id)
            if not args.dry_run:
                load.load_case(bundle)
            print(f"done case {c['caseId']} segments={len(bundle['transcript'])} "
                  f"evidence_items={len(bundle['evidence'])}")
            return bundle
        except Exception as exc:  # one failure must not abort the batch
            print(f"FAILED case {c.get('caseId')} {exc}")
            return {"caseId": c.get("caseId"), "error": str(exc)}

    results = []
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        results = list(ex.map(one, cases))
    if args.dry_run:
        with open("transcribe_report.json", "w") as f:
            json.dump(results, f, ensure_ascii=False, indent=1)
        print("dry-run → transcribe_report.json")
    ok = [r for r in results if "error" not in r]
    print(f"transcribed {len(ok)}/{len(cases)} cases (model_id={model_id})")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only-pair", action="store_true")
    ap.add_argument("--workers", type=int, default=2)
    ap.add_argument("--overrides", default=None)
    # Plan 4 transcription subcommand
    ap.add_argument("--transcribe", action="store_true", help="run the transcript pipeline instead of video sync")
    ap.add_argument("--cases-file", default=None, help="JSON list of {caseId, audio}")
    ap.add_argument("--model-id", default=None, help="frozen model id recorded on output")
    ap.add_argument("--dry-run", action="store_true", help="write transcribe_report.json, do not touch DB")
    args = ap.parse_args()

    if args.transcribe:
        if not args.cases_file:
            ap.error("--transcribe requires --cases-file")
        return transcribe_main(args)

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
