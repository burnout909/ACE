# 3-View 영상 처리 파이프라인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** S3의 두통 3뷰 DJI 원본을 오디오 교차상관으로 정렬하고 1080p 웹최적화로 재인코딩해, 진료당 동기화된 `{ceiling,bedside,evaluator}.mp4` 세트와 `encounters.json`을 S3 `processed/`에 생성한다.

**Architecture:** 로컬 Python 배치. 순수 로직(페어링/매니페스트)은 단위 테스트, ffmpeg 호출(오디오추출/xcorr/인코딩)은 명령 빌더를 단위 테스트하고 실데이터는 검증 스파이크로 확인. ffmpeg이 S3 presigned URL을 직접 읽어 로컬 재다운로드를 피한다. encounter 단위 재개·병렬.

**Tech Stack:** Python 3.9+, boto3, numpy, scipy, ffmpeg/ffprobe(로컬 설치됨, v8.0.1), pytest.

## Global Constraints

- S3 버킷: `ace-cpx-videos-2`, 리전: `ap-northeast-2` (자격증명은 환경변수 `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`).
- 원본 접두어: `두통/<view>/<dateFolder>/<name>.mp4`; 산출 접두어: `processed/두통/<dateFolder>/<trim>/<view>.mp4`.
- 뷰 매핑: `천장→ceiling`, `침상→bedside`, `평가자 시선→evaluator`. 기준(reference) 뷰 = `ceiling`.
- 대상 날짜(두통): `250826_tue, 250909_tue, 251111_tue, 251202_tue, 251216_tue`.
- 인코딩(확정): `libx264 -profile:v high -crf 23 -preset medium -movflags +faststart`, 비디오 `crop=1920:1080`, `-r 30000/1001`, 오디오 `aac -b:a 128k`, 메인 v/a만 매핑(DJI mjpeg 썸네일 제거).
- 코드 위치: 리포 `pipeline/`. 임시파일은 시스템 temp, S3에만 최종 업로드.
- DRY / YAGNI / TDD / 잦은 커밋.

---

## File Structure

- `pipeline/requirements.txt` — boto3, numpy, scipy, pytest
- `pipeline/config.py` — 상수(버킷/리전/접두어/뷰맵/날짜/인코딩 파라미터)
- `pipeline/pairing.py` — S3 원본 나열·파싱·encounter 그룹화·불일치 리포트
- `pipeline/sync.py` — 오디오 추출 + 교차상관 오프셋/신뢰도
- `pipeline/encode.py` — ffmpeg 트림/인코딩 명령 빌더 + 실행 + S3 업로드
- `pipeline/manifest.py` — encounters.json 빌더
- `pipeline/run.py` — 오케스트레이터 CLI(pair→sync→review gate→encode→manifest, 재개/병렬)
- `pipeline/tests/test_pairing.py`, `pipeline/tests/test_sync.py`, `pipeline/tests/test_encode.py`, `pipeline/tests/test_manifest.py`
- `pipeline/README.md`

---

## Task 1: 프로젝트 스캐폴드 + 설정

**Files:**
- Create: `pipeline/requirements.txt`, `pipeline/config.py`, `pipeline/__init__.py`, `pipeline/tests/__init__.py`
- Test: `pipeline/tests/test_config.py`

**Interfaces:**
- Produces: `config.VIEW_MAP: dict[str,str]`, `config.VIEWS: list[str]` (`["ceiling","bedside","evaluator"]`), `config.REFERENCE_VIEW="ceiling"`, `config.BUCKET`, `config.REGION`, `config.SRC_PREFIX="두통"`, `config.DST_PREFIX="processed/두통"`, `config.DATES: list[str]`, `config.FFMPEG_VIDEO_ARGS: list[str]`, `config.FFMPEG_AUDIO_ARGS: list[str]`.

- [ ] **Step 1: Write the failing test**

```python
# pipeline/tests/test_config.py
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pipeline && python -m pytest tests/test_config.py -v`
Expected: FAIL (module `pipeline.config` not found)

- [ ] **Step 3: Write minimal implementation**

```python
# pipeline/__init__.py
# (empty package marker)
```
```python
# pipeline/tests/__init__.py
# (empty package marker)
```
```python
# pipeline/config.py
BUCKET = "ace-cpx-videos-2"
REGION = "ap-northeast-2"
SRC_PREFIX = "두통"
DST_PREFIX = "processed/두통"

VIEW_MAP = {"천장": "ceiling", "침상": "bedside", "평가자 시선": "evaluator"}
VIEWS = ["ceiling", "bedside", "evaluator"]
REFERENCE_VIEW = "ceiling"

DATES = ["250826_tue", "250909_tue", "251111_tue", "251202_tue", "251216_tue"]

# ffmpeg args (video/audio) applied during encode; -ss/-t/-i added per call.
FFMPEG_VIDEO_ARGS = [
    "-map", "0:v:0", "-map", "0:a:0",
    "-vf", "crop=1920:1080",
    "-r", "30000/1001",
    "-c:v", "libx264", "-profile:v", "high", "-crf", "23", "-preset", "medium",
    "-movflags", "+faststart",
]
FFMPEG_AUDIO_ARGS = ["-c:a", "aac", "-b:a", "128k"]

SYNC_WINDOW_SEC = 120        # audio window used for cross-correlation
SYNC_AUDIO_RATE = 16000      # mono resample rate for xcorr
SYNC_CONFIDENCE_MIN = 0.30   # below → flag for manual review
```
```text
# pipeline/requirements.txt
boto3>=1.34
numpy>=1.24
scipy>=1.10
pytest>=7
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pipeline && python -m pytest tests/test_config.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add pipeline/
git commit -m "feat(pipeline): scaffold config and package"
```

---

## Task 2: 페어링 (파일명 파싱 + encounter 그룹화 + 불일치 리포트)

**Files:**
- Create: `pipeline/pairing.py`
- Test: `pipeline/tests/test_pairing.py`

**Interfaces:**
- Consumes: `config.VIEW_MAP`, `config.VIEWS`, `config.DATES`.
- Produces:
  - `parse_key(key: str) -> dict | None` → `{"view","dateFolder","trim","name"}` 또는 파싱 불가 시 `None`.
  - `build_encounters(keys: list[str]) -> tuple[list[dict], list[dict]]` → `(encounters, issues)`.
    - encounter: `{"id","dateFolder","trim","views": {view: key}, "missingViews": [view,...]}`.
    - issue: `{"dateFolder","trim","missingViews"}` (뷰가 3개 미만인 encounter).

- [ ] **Step 1: Write the failing test**

```python
# pipeline/tests/test_pairing.py
from pipeline.pairing import parse_key, build_encounters

def test_parse_key_basic():
    k = "두통/천장/251111_tue/DJI_20251111132039_0039_D - Trim1.mp4"
    p = parse_key(k)
    assert p == {"view": "ceiling", "dateFolder": "251111_tue",
                 "trim": "1", "name": "DJI_20251111132039_0039_D - Trim1.mp4"}

def test_parse_key_split_trim():
    k = "두통/평가자 시선/251216_tue/DJI_x - Trim5-1.mp4"
    p = parse_key(k)
    assert p["view"] == "evaluator" and p["trim"] == "5-1"

def test_parse_key_ignores_non_mp4_and_raw():
    assert parse_key("두통/천장/251111_tue/raw/") is None
    assert parse_key("두통/천장/251111_tue/notes.txt") is None

def test_build_encounters_full_triplet():
    keys = [
        "두통/천장/251111_tue/DJI_a - Trim1.mp4",
        "두통/침상/251111_tue/DJI_b - Trim1.mp4",
        "두통/평가자 시선/251111_tue/DJI_c - Trim1.mp4",
    ]
    enc, issues = build_encounters(keys)
    assert len(enc) == 1
    e = enc[0]
    assert e["id"] == "251111_tue__trim1"
    assert set(e["views"].keys()) == {"ceiling", "bedside", "evaluator"}
    assert e["missingViews"] == []
    assert issues == []

def test_build_encounters_missing_view_flagged():
    keys = [
        "두통/천장/251216_tue/DJI_a - Trim9.mp4",
        "두통/침상/251216_tue/DJI_b - Trim9.mp4",
        # evaluator missing
    ]
    enc, issues = build_encounters(keys)
    assert enc[0]["missingViews"] == ["evaluator"]
    assert issues == [{"dateFolder": "251216_tue", "trim": "9", "missingViews": ["evaluator"]}]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pipeline && python -m pytest tests/test_pairing.py -v`
Expected: FAIL (module `pipeline.pairing` not found)

- [ ] **Step 3: Write minimal implementation**

```python
# pipeline/pairing.py
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pipeline && python -m pytest tests/test_pairing.py -v`
Expected: PASS (5 passed)

- [ ] **Step 5: Commit**

```bash
git add pipeline/pairing.py pipeline/tests/test_pairing.py
git commit -m "feat(pipeline): pairing of 3-view originals into encounters"
```

---

## Task 3: 오디오 교차상관 오프셋 검출

**Files:**
- Create: `pipeline/sync.py`
- Test: `pipeline/tests/test_sync.py`

**Interfaces:**
- Consumes: `config.SYNC_AUDIO_RATE`, `config.SYNC_WINDOW_SEC`.
- Produces:
  - `xcorr_offset(ref: np.ndarray, other: np.ndarray, rate: int) -> tuple[float, float]` → `(offset_sec, confidence)`. `offset_sec>0` 이면 `other`가 `ref`보다 그만큼 **늦게** 시작(= other 앞을 잘라야 함). confidence는 0~1.
  - `extract_audio(url: str, rate: int, window_sec: int) -> np.ndarray` (ffmpeg으로 mono float32 추출; 실데이터용, 단위테스트에서는 monkeypatch).
  - `encounter_offsets(view_urls: dict[str,str]) -> dict` → `{"bedside":{"offset":..,"confidence":..}, "evaluator":{...}}` (기준=ceiling).

- [ ] **Step 1: Write the failing test**

```python
# pipeline/tests/test_sync.py
import numpy as np
from pipeline.sync import xcorr_offset

def _signal(n=48000, seed=0):
    rng = np.random.default_rng(seed)
    return rng.standard_normal(n).astype(np.float32)

def test_xcorr_detects_known_positive_offset():
    rate = 16000
    ref = _signal(rate * 5)
    shift = 800  # samples = 0.05s; 'other' starts 0.05s later than ref
    other = np.concatenate([np.zeros(shift, np.float32), ref])[: ref.size]
    off, conf = xcorr_offset(ref, other, rate)
    assert abs(off - (shift / rate)) < 0.005
    assert conf > 0.5

def test_xcorr_zero_offset():
    rate = 16000
    ref = _signal(rate * 5)
    off, conf = xcorr_offset(ref, ref.copy(), rate)
    assert abs(off) < 0.005
    assert conf > 0.9

def test_xcorr_uncorrelated_low_confidence():
    rate = 16000
    off, conf = xcorr_offset(_signal(rate*5, 1), _signal(rate*5, 2), rate)
    assert conf < 0.3
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pipeline && python -m pytest tests/test_sync.py -v`
Expected: FAIL (module `pipeline.sync` not found)

- [ ] **Step 3: Write minimal implementation**

```python
# pipeline/sync.py
import subprocess
import numpy as np
from scipy import signal as _sp
from pipeline import config

def xcorr_offset(ref, other, rate):
    """Return (offset_sec, confidence). offset>0 => 'other' starts later than 'ref'."""
    a = ref - np.mean(ref)
    b = other - np.mean(other)
    corr = _sp.fftconvolve(b, a[::-1], mode="full")
    lags = np.arange(-len(a) + 1, len(b))
    idx = int(np.argmax(np.abs(corr)))
    lag = lags[idx]                       # b delayed by 'lag' samples vs a
    offset_sec = lag / rate
    peak = abs(corr[idx])
    denom = np.sqrt(np.sum(a * a) * np.sum(b * b)) or 1.0
    confidence = float(min(1.0, peak / denom))
    return offset_sec, confidence

def extract_audio(url, rate=None, window_sec=None):
    """Extract mono float32 PCM from the first window_sec via ffmpeg reading url directly."""
    rate = rate or config.SYNC_AUDIO_RATE
    window_sec = window_sec or config.SYNC_WINDOW_SEC
    cmd = [
        "ffmpeg", "-nostdin", "-v", "error",
        "-t", str(window_sec), "-i", url,
        "-vn", "-ac", "1", "-ar", str(rate),
        "-f", "f32le", "pipe:1",
    ]
    out = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(out, dtype="<f4").copy()

def encounter_offsets(view_urls):
    rate = config.SYNC_AUDIO_RATE
    ref = extract_audio(view_urls[config.REFERENCE_VIEW], rate)
    result = {}
    for view, url in view_urls.items():
        if view == config.REFERENCE_VIEW:
            continue
        other = extract_audio(url, rate)
        n = min(len(ref), len(other))
        off, conf = xcorr_offset(ref[:n], other[:n], rate)
        result[view] = {"offset": off, "confidence": conf}
    return result
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pipeline && python -m pytest tests/test_sync.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add pipeline/sync.py pipeline/tests/test_sync.py
git commit -m "feat(pipeline): audio cross-correlation offset detection"
```

---

## Task 4: 인코딩 명령 빌더 + 실행/업로드

**Files:**
- Create: `pipeline/encode.py`
- Test: `pipeline/tests/test_encode.py`

**Interfaces:**
- Consumes: `config.FFMPEG_VIDEO_ARGS`, `config.FFMPEG_AUDIO_ARGS`.
- Produces:
  - `build_encode_cmd(url: str, out_path: str, start_sec: float, dur_sec: float) -> list[str]`.
  - `dst_key(date_folder: str, trim: str, view: str) -> str`.
  - `probe_duration(url: str) -> float` (ffprobe).
  - `common_plan(offsets: dict[str,float], durations: dict[str,float]) -> tuple[dict[str,float], float]` → `(per_view_start, common_duration)`.

- [ ] **Step 1: Write the failing test**

```python
# pipeline/tests/test_encode.py
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pipeline && python -m pytest tests/test_encode.py -v`
Expected: FAIL (module `pipeline.encode` not found)

- [ ] **Step 3: Write minimal implementation**

```python
# pipeline/encode.py
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pipeline && python -m pytest tests/test_encode.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add pipeline/encode.py pipeline/tests/test_encode.py
git commit -m "feat(pipeline): ffmpeg encode command builder, plan, upload"
```

---

## Task 5: encounters.json 매니페스트 빌더

**Files:**
- Create: `pipeline/manifest.py`
- Test: `pipeline/tests/test_manifest.py`

**Interfaces:**
- Consumes: `config.DST_PREFIX`, `encode.dst_key`.
- Produces: `build_manifest(processed: list[dict]) -> dict`.
  - 입력 항목: `{"id","dateFolder","trim","durationSec","views":{view:{"offsetAppliedSec"}},"sync":{...},"missingViews"}`.
  - 출력: `{"complaint":"두통","encoding":{...},"encounters":[... with view keys filled via dst_key ...]}`.

- [ ] **Step 1: Write the failing test**

```python
# pipeline/tests/test_manifest.py
from pipeline.manifest import build_manifest

def test_build_manifest_fills_keys():
    processed = [{
        "id": "251111_tue__trim1", "dateFolder": "251111_tue", "trim": "1",
        "durationSec": 658.0,
        "views": {
            "ceiling": {"offsetAppliedSec": 0.0},
            "bedside": {"offsetAppliedSec": 13.0},
            "evaluator": {"offsetAppliedSec": 22.0},
        },
        "sync": {"method": "audio-xcorr", "confidence": 0.86, "reviewed": False},
        "missingViews": [],
    }]
    m = build_manifest(processed)
    assert m["complaint"] == "두통"
    e = m["encounters"][0]
    assert e["views"]["bedside"]["key"] == "processed/두통/251111_tue/1/bedside.mp4"
    assert e["views"]["bedside"]["offsetAppliedSec"] == 13.0
    assert "video" in m["encoding"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pipeline && python -m pytest tests/test_manifest.py -v`
Expected: FAIL (module `pipeline.manifest` not found)

- [ ] **Step 3: Write minimal implementation**

```python
# pipeline/manifest.py
from pipeline import config
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pipeline && python -m pytest tests/test_manifest.py -v`
Expected: PASS (1 passed)

- [ ] **Step 5: Commit**

```bash
git add pipeline/manifest.py pipeline/tests/test_manifest.py
git commit -m "feat(pipeline): encounters.json manifest builder"
```

---

## Task 6: 오케스트레이터 CLI (pair→sync→encode→manifest, 재개/병렬)

**Files:**
- Create: `pipeline/run.py`, `pipeline/s3util.py`, `pipeline/README.md`

**Interfaces:**
- Consumes: `pairing.build_encounters`, `sync.encounter_offsets`, `encode.*`, `manifest.build_manifest`.
- Produces: CLI `python -m pipeline.run [--only-pair] [--workers N] [--overrides sync_overrides.json]`. 산출: `pairing_report.json`, `sync_report.json`(로컬), S3 `processed/...`, S3 `processed/두통/encounters.json`.

- [ ] **Step 1: Write the failing test** (S3 나열/presign 유틸의 순수부만 테스트)

```python
# pipeline/tests/test_s3util.py
from pipeline.s3util import list_source_keys_from_pages

def test_list_source_keys_from_pages_filters_mp4():
    pages = [{"Contents": [
        {"Key": "두통/천장/251111_tue/a - Trim1.mp4"},
        {"Key": "두통/천장/251111_tue/raw/"},
        {"Key": "두통/천장/251111_tue/x.txt"},
    ]}]
    keys = list_source_keys_from_pages(pages)
    assert keys == ["두통/천장/251111_tue/a - Trim1.mp4"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pipeline && python -m pytest tests/test_s3util.py -v`
Expected: FAIL (module `pipeline.s3util` not found)

- [ ] **Step 3: Write minimal implementation**

```python
# pipeline/s3util.py
import boto3
from pipeline import config

def list_source_keys_from_pages(pages):
    keys = []
    for page in pages:
        for obj in page.get("Contents", []):
            k = obj["Key"]
            if k.lower().endswith(".mp4"):
                keys.append(k)
    return keys

def list_source_keys(s3=None):
    s3 = s3 or boto3.client("s3", region_name=config.REGION)
    paginator = s3.get_paginator("list_objects_v2")
    pages = paginator.paginate(Bucket=config.BUCKET, Prefix=config.SRC_PREFIX + "/")
    return list_source_keys_from_pages(pages)

def presign(key, s3=None, expires=6 * 3600):
    s3 = s3 or boto3.client("s3", region_name=config.REGION)
    return s3.generate_presigned_url("get_object",
        Params={"Bucket": config.BUCKET, "Key": key}, ExpiresIn=expires)
```
```python
# pipeline/run.py
import argparse, json, os, tempfile
from concurrent.futures import ThreadPoolExecutor
import boto3
from pipeline import config, pairing, sync, encode, manifest, s3util

def process_encounter(enc, overrides, s3):
    view_urls = {v: s3util.presign(k, s3) for v, k in enc["views"].items()}
    # offsets: reference=0; others via xcorr unless overridden
    ov = overrides.get(enc["id"], {})
    offs = sync.encounter_offsets(view_urls)
    offsets = {config.REFERENCE_VIEW: 0.0}
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

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only-pair", action="store_true")
    ap.add_argument("--workers", type=int, default=2)
    ap.add_argument("--overrides", default=None)
    args = ap.parse_args()

    s3 = boto3.client("s3", region_name=config.REGION)
    keys = s3util.list_source_keys(s3)
    encounters, issues = pairing.build_encounters(keys)
    json.dump({"issues": issues, "count": len(encounters)},
              open("pairing_report.json", "w"), ensure_ascii=False, indent=1)
    print(f"encounters={len(encounters)} issues={len(issues)}")
    if args.only_pair:
        return

    overrides = json.load(open(args.overrides)) if args.overrides else {}
    # only encode encounters that have all views present (skip 2-view for now unless overridden)
    todo = [e for e in encounters if not e["missingViews"] or e["id"] in overrides]

    processed = []
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        for r in ex.map(lambda e: process_encounter(e, overrides, s3), todo):
            processed.append(r)
            print("done", r["id"], "conf=", r["sync"]["confidence"])

    json.dump({e["id"]: e["sync"] for e in processed},
              open("sync_report.json", "w"), ensure_ascii=False, indent=1)
    m = manifest.build_manifest(processed)
    s3.put_object(Bucket=config.BUCKET, Key=f"{config.DST_PREFIX}/encounters.json",
                  Body=json.dumps(m, ensure_ascii=False, indent=1).encode(),
                  ContentType="application/json")
    print("manifest uploaded:", f"{config.DST_PREFIX}/encounters.json")

if __name__ == "__main__":
    main()
```
```markdown
<!-- pipeline/README.md -->
# 두통 3-View 처리 파이프라인

## 준비
```
pip install -r requirements.txt
export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_DEFAULT_REGION=ap-northeast-2
```

## 실행
```
python -m pipeline.run --only-pair            # 페어링 리포트만
python -m pipeline.run --workers 3            # 전체: 정렬+인코딩+업로드+매니페스트
python -m pipeline.run --overrides sync_overrides.json   # 수동 오프셋 반영 재실행
```
재실행 시 S3에 이미 있는 산출물은 skip(재개).
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pipeline && python -m pytest tests/ -v`
Expected: PASS (전체 테스트 통과)

- [ ] **Step 5: Commit**

```bash
git add pipeline/s3util.py pipeline/run.py pipeline/README.md pipeline/tests/test_s3util.py
git commit -m "feat(pipeline): orchestrator CLI with resume and parallelism"
```

---

## Task 7: 검증 스파이크 (실데이터 1건)

**Files:** 없음(운영 검증). 결과를 `pairing_report.json`/`sync_report.json`로 확인.

- [ ] **Step 1:** 전송 완료 후(또는 `251111_tue trim1`이 3뷰 모두 S3에 존재하면) 실행:
`cd pipeline && python -m pipeline.run --only-pair` → `pairing_report.json`에서 encounter/issue 수 확인.
- [ ] **Step 2:** 단일 encounter만 인코딩 확인용으로 `--workers 1` 로 전체 실행하되, 완료된 3뷰가 있는 날짜부터 처리되는지 로그 확인. (첫 encounter 완료 후 필요시 Ctrl-C — 재개 가능)
- [ ] **Step 3:** `sync_report.json`의 `251111_tue__trim1` confidence 확인. 파일명 시각차(천장 13:20:39 / 침상 13:20:52 ≈ 13s)와 검출 오프셋이 유사한지 대조.
- [ ] **Step 4:** S3 `processed/두통/251111_tue/1/{ceiling,bedside,evaluator}.mp4` 를 presigned URL로 받아 3개를 동시에 눈으로 재생 → 시작 동기·화질 확인.
- [ ] **Step 5:** 정확하면 전체 배치 진행. 어긋나면 `sync_overrides.json`에 오프셋 교정 후 재실행.

---

## Self-Review (작성자 체크 완료)

- **Spec 커버리지**: 페어링(§4.1)=Task2, 오디오 정렬+신뢰도(§4.2)=Task3, 트림/인코딩(§4.3)=Task4, manifest/출력(§4.4)=Task5, 오케스트레이터·재개·병렬(§4.5)=Task6, 검증 스파이크(§4.6)=Task7. 수동검수는 `--overrides`(Task6) + Task7로 커버.
- **엣지(§7)**: 뷰 누락→pairing `missingViews`+report(Task2), 기본은 3뷰만 인코딩(Task6 `todo` 필터), 저신뢰도→confidence 기록+overrides. Trim 분할→parse_key가 `5-1` 파싱(Task2).
- **타입 일관성**: `dst_key`/`common_plan`/`encounter_offsets` 시그니처가 Task4·5·6에서 일치.
- 비고: 2뷰-only encounter의 자동 인코딩은 기본 제외(overrides로 명시 시만) — spec의 "2뷰로 표시하되 플래그" 취지에 맞춤(리포트엔 남고 산출은 옵트인).
