# CPX Plan 4 — 전사문 1차 추출 파이프라인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** 케이스 오디오 → ASR 전사(+화자분리) → 체크리스트 항목별 근거 발화·timestamp 매핑 → Mode B 콘텐츠(`transcript.json` + evidence) 1차 산출. AI Yes/No verdict는 분리 저장(평가자 비노출).

**Architecture:** 기존 Python `pipeline/`(브랜치 `feat/video-pipeline`)를 연장. ASR·LLM을 인터페이스(Protocol) 뒤에 두어 순수 파싱·매핑·verdict분리 로직을 pytest로 TDD, 외부 호출은 mock. 산출물은 백오피스 교정 게이트(Plan 3 Task 6)로 넘겨 freeze 후 서빙.

**Tech Stack:** Python 3(기존 파이프라인), 클라우드 ASR(Clova 권장/OpenAI 대안), LLM(연구기간 단일 버전 동결).

## Global Constraints
- 근거 스펙 §10, §1(ASR=클라우드+1차자동+수동교정). 기존 파이프라인 TDD 패턴(순수로직) 따름.
- **AI verdict는 evidence 산출물에 절대 포함 금지** — `ai_alone`로만.
- LLM 모델 버전·파라미터 **사전등록**, 산출물에 `model_id` 기록.
- 산출 `transcript.json`은 앱 `TranscriptSegment{id,start,end,text,timestamp,speaker}` 형과 일치.
- IRB: 오디오 클라우드 전송 → 처리환경 명시. 이 Plan은 `feat/video-pipeline` 코드를 확장(병합 후 또는 해당 브랜치에서 작업).

## File Structure
- `pipeline/transcribe.py` — ASR 인터페이스 + 전사 정규화.
- `pipeline/evidence.py` — LLM 인터페이스 + 항목별 근거 매핑 + verdict 분리.
- `pipeline/tests/test_transcribe.py`, `pipeline/tests/test_evidence.py`
- `pipeline/run.py` — `--transcribe` 서브커맨드 배선(기존 CLI 확장).

---

## Task 1: ASR 전사 정규화 (순수 로직, TDD)
**Files:** Create `pipeline/transcribe.py`, `pipeline/tests/test_transcribe.py`
**Interfaces:**
- `class Asr(Protocol): def transcribe(self, audio_path: str) -> list[dict]` — raw segments `{start,end,text,speaker?}`.
- `def normalize_segments(raw: list[dict]) -> list[dict]` — 앱 `TranscriptSegment` 형(`id`,`start`,`end`,`text`,`timestamp`,`speaker`)으로 변환, `timestamp="MM:SS"`.

- [ ] **Step 1: 실패 테스트**
```python
from pipeline.transcribe import normalize_segments

def test_normalize_adds_id_and_mmss_timestamp():
    raw = [{"start": 5.0, "end": 8.2, "text": "머리가 아파요", "speaker": "student"},
           {"start": 75.0, "end": 78.0, "text": "언제부터요?", "speaker": "sp"}]
    out = normalize_segments(raw)
    assert out[0]["id"] == "seg-0"
    assert out[0]["timestamp"] == "00:05"
    assert out[1]["timestamp"] == "01:15"
    assert out[1]["speaker"] == "sp"
```
- [ ] **Step 2: 실패 확인** — Run `cd pipeline && python -m pytest tests/test_transcribe.py -q` → FAIL.
- [ ] **Step 3: 구현**
```python
def _mmss(sec: float) -> str:
    s = int(sec); return f"{s // 60:02d}:{s % 60:02d}"

def normalize_segments(raw: list[dict]) -> list[dict]:
    out = []
    for i, r in enumerate(raw):
        out.append({
            "id": f"seg-{i}", "start": float(r["start"]), "end": float(r["end"]),
            "text": r["text"].strip(), "timestamp": _mmss(r["start"]),
            "speaker": r.get("speaker"),
        })
    return out
```
- [ ] **Step 4: 통과 확인** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(pipeline): ASR segment normalization to app transcript schema"`

---

## Task 2: 항목별 근거 매핑 + verdict 분리 (순수 로직, TDD)
**Files:** Create `pipeline/evidence.py`, `pipeline/tests/test_evidence.py`
**Interfaces:**
- `class Evaluator(Protocol): def evaluate(self, checklist: list[dict], transcript: list[dict]) -> list[dict]` — raw `{questionId, evidence[], verdict}`.
- `def split_evidence_verdict(raw: list[dict]) -> tuple[list[dict], list[dict]]` — `(evidence_for_rater, verdict_for_ai_alone)`. evidence 쪽에는 `verdict` 키가 **절대 없어야** 함.

- [ ] **Step 1: 실패 테스트**
```python
from pipeline.evidence import split_evidence_verdict

def test_split_strips_verdict_from_rater_evidence():
    raw = [{"questionId": "hx1", "evidence": [{"text": "머리가 아파요", "t": 5.0}], "verdict": "yes"}]
    ev, verdicts = split_evidence_verdict(raw)
    assert ev == [{"questionId": "hx1", "evidence": [{"text": "머리가 아파요", "t": 5.0}]}]
    assert "verdict" not in ev[0]
    assert verdicts == [{"questionId": "hx1", "verdict": "yes"}]
```
- [ ] **Step 2: 실패 확인** → FAIL.
- [ ] **Step 3: 구현**
```python
def split_evidence_verdict(raw: list[dict]) -> tuple[list[dict], list[dict]]:
    evidence, verdicts = [], []
    for r in raw:
        evidence.append({"questionId": r["questionId"], "evidence": r.get("evidence", [])})
        verdicts.append({"questionId": r["questionId"], "verdict": r.get("verdict")})
    return evidence, verdicts
```
- [ ] **Step 4: 통과 확인** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(pipeline): split rater-facing evidence from AI verdict (ai_alone)"`

---

## Task 3: 케이스 전사 파이프라인 배선 (mock ASR/LLM E2E)
**Files:** Modify `pipeline/run.py`, add `pipeline/tests/test_transcribe_flow.py`
**Interfaces:** `def transcribe_case(case_id, audio_path, checklist, asr: Asr, evaluator: Evaluator, model_id: str) -> dict` — `{caseId, transcript, evidence, verdicts, model_id, frozen: False}`.
- [ ] **Step 1: 실패 테스트(mock 주입)**
```python
from pipeline.transcribe import transcribe_case

class FakeAsr:
    def transcribe(self, p): return [{"start": 5.0, "end": 8.0, "text": "머리가 아파요", "speaker": "student"}]
class FakeEval:
    def evaluate(self, c, t): return [{"questionId": "hx1", "evidence": [{"text": "머리가 아파요", "t": 5.0}], "verdict": "yes"}]

def test_transcribe_case_bundles_content_without_verdict_in_evidence():
    out = transcribe_case(3, "a.wav", [{"id": "hx1"}], FakeAsr(), FakeEval(), "clova-x-2026-06")
    assert out["caseId"] == 3 and out["frozen"] is False
    assert out["model_id"] == "clova-x-2026-06"
    assert "verdict" not in out["evidence"][0]
    assert out["verdicts"][0]["verdict"] == "yes"
    assert out["transcript"][0]["timestamp"] == "00:05"
```
- [ ] **Step 2: 실패 확인** → FAIL.
- [ ] **Step 3: 구현**
```python
def transcribe_case(case_id, audio_path, checklist, asr, evaluator, model_id):
    transcript = normalize_segments(asr.transcribe(audio_path))
    ev, verdicts = split_evidence_verdict(evaluator.evaluate(checklist, transcript))
    return {"caseId": case_id, "transcript": transcript, "evidence": ev,
            "verdicts": verdicts, "model_id": model_id, "frozen": False}
```
- [ ] **Step 4: 통과 확인** → PASS.
- [ ] **Step 5: CLI + 실 어댑터** — `run.py`에 `--transcribe` 추가: 실제 Clova/OpenAI `Asr` 어댑터와 LLM `Evaluator`(현 `lib/openai.ts` 로직 이식/재사용)로 각 케이스 처리 → `case_content`에 upsert(`frozen=False`). 실 ASR/LLM 어댑터는 얇게, 로직은 위 순수 함수 재사용. Commit `git commit -m "feat(pipeline): transcribe_case flow with mockable ASR/LLM adapters"`

---

## Task 4: 산출물 → DB 적재 (백오피스 교정 게이트 연결)
**Files:** Modify `pipeline/run.py`(적재), 문서화
- [ ] **Step 1: 적재** — `transcribe_case` 결과를 Supabase `case_content`(transcript/evidence/model_id/frozen=false) + `ai_alone`(verdicts) 테이블에 적재(서비스 키). 평가자엔 아직 미노출(frozen=false).
- [ ] **Step 2: 확인** — 적재 후 백오피스 교정 페이지(Plan 3 Task 6)에서 1차 산출이 보이고, freeze 전엔 Mode B에 안 뜸.
- [ ] **Step 3: 파일럿** — 1~2 케이스로 ASR 품질·근거 정확도 육안 검수(Clova vs OpenAI 대조 결정).
- [ ] **Step 4: Commit** — `git commit -m "feat(pipeline): load transcript content and ai_alone verdicts to DB"`

---

## Self-Review
- 스펙 커버리지 §10: ASR정규화=Task1; 근거매핑=Task2·3; verdict분리(ai_alone)=Task2·3·4; LLM동결(model_id)=Task3; 1차→교정게이트=Task4(+Plan3 Task6); IRB 오디오처리환경=Global Constraints 명시.
- 순수로직 TDD: `normalize_segments`, `split_evidence_verdict`, `transcribe_case`(mock 주입) 전부 결정론.
- 타입 일관성: `transcript` 세그먼트가 앱 `TranscriptSegment`와 일치; `evidence`가 앱 `AiEvaluation{questionId, evidence[]}`와 정합; `frozen`이 Plan 1 case 로드/Plan 3 freeze와 일치.
- **교차 브랜치 주의:** 이 Plan은 `pipeline/`(feat/video-pipeline)를 확장 → 실행 전 해당 브랜치 병합 또는 그 위에서 작업할지 결정 필요.
