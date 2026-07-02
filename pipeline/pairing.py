import re
from pipeline import config

_TRIM_RE = re.compile(r"Trim\s*([0-9]+(?:-[0-9]+)?)", re.IGNORECASE)

def parse_key(key: str):
    parts = key.split("/")
    # expect: 두통/<view_kr>/<dateFolder>/<name>
    if len(parts) != 4:
        return None
    _, view_kr, date_folder, name = parts
    if not name.lower().endswith(".mp4"):
        return None
    view = config.VIEW_MAP.get(view_kr)
    if view is None:
        return None
    m = _TRIM_RE.search(name)
    if not m:
        return None
    return {"view": view, "dateFolder": date_folder, "trim": m.group(1), "name": name}

def build_encounters(keys):
    grouped = {}  # (dateFolder, trim) -> {view: key}
    for k in keys:
        p = parse_key(k)
        if p is None:
            continue
        gk = (p["dateFolder"], p["trim"])
        grouped.setdefault(gk, {})[p["view"]] = k

    encounters, issues = [], []
    for (date_folder, trim), views in sorted(grouped.items()):
        missing = [v for v in config.VIEWS if v not in views]
        enc = {
            "id": f"{date_folder}__trim{trim}",
            "dateFolder": date_folder,
            "trim": trim,
            "views": views,
            "missingViews": missing,
        }
        encounters.append(enc)
        if missing:
            issues.append({"dateFolder": date_folder, "trim": trim, "missingViews": missing})
    return encounters, issues
