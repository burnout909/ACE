from pipeline.encode import dst_key

ENCODING_DESC = {"video": "h264 1920x1080 crf23 faststart", "audio": "aac 128k"}

def build_manifest(processed):
    encounters = []
    for e in processed:
        views = {}
        for view, meta in e["views"].items():
            views[view] = {
                "key": dst_key(e["dateFolder"], e["trim"], view),
                "offsetAppliedSec": meta["offsetAppliedSec"],
            }
        encounters.append({
            "id": e["id"],
            "dateFolder": e["dateFolder"],
            "trim": e["trim"],
            "durationSec": e["durationSec"],
            "views": views,
            "sync": e.get("sync", {}),
            "missingViews": e.get("missingViews", []),
        })
    return {"complaint": "두통", "encoding": ENCODING_DESC, "encounters": encounters}
