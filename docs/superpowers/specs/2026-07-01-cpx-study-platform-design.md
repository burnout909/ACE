# ACE — 두통 CPX 채점 효용성 연구 플랫폼 설계 (5개 기능)

- 날짜: 2026-07-01
- 상태: 설계 승인됨 (brainstorming Checkpoint A/B/C 사용자 승인)
- 근거 문서: `~/Downloads/research_proposal_260526.html` (연구계획서, v0.x)
- 상위 맥락: 기존 ACE 앱은 단일 케이스 프로토타입 → 본 설계로 **연구 실험 채점 플랫폼**으로 확장

## 0. 배경과 목적

ACE Next.js 앱은 "AI 기반 CPX 채점 보조 솔루션 효용성 평가" 연구의 데이터 수집 플랫폼이다.
두통 단일 표현형, 2-period crossover paired design, 평가자 = 신경과 교수 4인(P1–P4), 30 케이스 전수.

**두 채점 조건 (UI 골격 동일, AI 요소만 토글):**
- **Mode A (대조):** 영상 + 빈 체크리스트. AI 전사문/타임스탬프/verdict 모두 비제공.
- **Mode B (보조):** 영상 + 체크리스트 항목별 AI 근거 발화(transcript snippet) + 타임스탬프 점프(−10초 보정). **AI Yes/No verdict는 숨김**(priming 차단).

**측정 지표 = 앱 산출물:** H1 소요시간 timeB<timeA(primary), H2 정확도 비열등(vs Gold Standard), H3 SUS·NASA-TLX, H4 섹션(Hx/PEx/Edu)×모드 이질성. 케이스·항목 단위의 시간·클릭·타임스탬프점프·판정 이벤트가 곧 연구 결과물.

**본 설계가 다루는 5개 기능:**
1. 로그인/신원식별
2. 이벤트 추적 (→ 자체 Postgres 이벤트 로그로 확정, Mixpanel 미사용)
3. 진행상황 추적
4. 백오피스
5. 전사문 1차 추출

## 1. 확정된 핵심 결정 (Q&A 결과)

| 결정 항목 | 선택 | 비고 |
|---|---|---|
| 핵심 연구 데이터 저장소 | **관리형 Postgres — Supabase** | **서울 리전(ap-northeast-2)** 선택으로 데이터 해외상주 IRB 우려 완화. 처리환경·DPA를 IRB에 명시. |
| 인증/신원식별 | **토큰 URL + PIN(2요소)** | 토큰은 `rater × session` 단위. PIN은 링크와 다른 채널(문자)로 전달. 이메일 OTP는 대안. |
| Session 2 활성화 | **자동 자격계산 + 관리자 최종승인** | 시스템이 (S1완료 + wash-out경과)를 자동 계산해 후보로 띄우고, 관리자가 백오피스에서 최종 개방. |
| 케이스 제출 후 | **제출 시 잠금** | H1 시간 측정 무결성. 관리자 unlock은 백오피스(감사로그). |
| 이벤트 진실 원본 | **Postgres만 (Mixpanel 미사용)** | 서버 타임스탬프 append-only. 분석은 pandas(추후 PostHog self-host 옵션). 외부 SaaS 의존 제거. |
| ASR 엔진 | **클라우드 ASR** | Clova(한국어 의료 강점) 권장, OpenAI Whisper 대안(기존 앱과 일관). 파일럿에서 확정. 오디오 외부유출 → IRB 처리환경 명시 + 2차활용 동의 범위 확인. |
| 전사문 교정 | **1차 자동 + 수동 교정 게이트** | 백오피스에서 검토·수정 후 freeze. frozen만 Mode B로 서빙. |

## 2. 종합 아키텍처

```
평가자 브라우저 (Next.js 앱)
   │  개인화 토큰 URL + PIN (2요소)
   ▼
Next.js Route Handlers (/api/*)   ── 서버측 timestamp·검증·케이스 잠금
   ▼
Supabase (Postgres, 서울 ap-northeast-2) + Row-Level Security
   ├─ 연구 데이터 원본 (신원·스케줄·답변·진행)
   └─ 이벤트 로그 (권위 원본, 서버 ts)          ← Mixpanel 없음
케이스 콘텐츠 (영상 URL·transcript·항목별 근거)  = 파이프라인 산출물(기능 ⑤), 사전 로드
```

**핵심 스탠스:** 모든 연구 측정치는 서버 API를 반드시 경유해 Postgres에 서버 타임스탬프로 기록. 클라이언트 localStorage는 오프라인 임시버퍼로만(신뢰 원본 아님). 외부 SaaS 의존은 ASR(기능 ⑤ 오디오 처리)뿐 — IRB 처리환경에 그것만 명시.

## 3. 데이터 모델 (핵심 테이블)

| 테이블 | 핵심 컬럼 | 용도 |
|---|---|---|
| `raters` | id(P1–P4), name, pin_hash, contact, schedule_seed | 기능 ① 신원, 스케줄 재현용 시드 |
| `cases` | id(1–30), video_urls(3뷰), phenotype='두통' | 케이스 |
| `checklist_items` | id, section(Hx/PEx/Edu), scale('binary'\|'triple'), text, order | 체크리스트 (척도 이원화) |
| `sessions` | rater_id, period(1\|2), status(locked/active/done), window_open_at, window_close_at | 세션 윈도·활성화 |
| `assignments` | rater_id, case_id, period, mode(A\|B), order_index | 크로스오버 스케줄 (서버 생성·불변) |
| `case_progress` | assignment_id, state, active_ms, enter_at, submit_at | 기능 ③ 진행 · H1 활성시간 |
| `answers` | assignment_id, item_id, value, decided_at, revised_count | 채점 답변 (원본) |
| `events` | id(uuid), rater_id, assignment_id, type, payload(jsonb), client_ts, **server_ts**, mode, section | 기능 ② 권위 이벤트 로그 (append-only) |
| `case_content` | case_id, transcript(jsonb), evidence(jsonb per item), model_id, frozen(bool) | 기능 ⑤ Mode B 콘텐츠 |
| `ai_alone` | case_id, item_id, verdict, evidence | AI 단독 채점 (평가자 비노출, GS-vs-AI-alone 2차 outcome) |
| `admins` | Supabase Auth 사용자 (송지우·김민성) | 기능 ④ 백오피스 접근 |
| `audit_log` | admin_id, action, target, reason, ts | 관리자 액션 감사 |

**AI verdict 격리:** `case_content.evidence`는 근거 발화+timestamp만(현 `AiEvaluation{questionId, evidence[]}` 구조). Yes/No verdict는 `ai_alone`에만 저장하고 평가자 UI에는 어떤 모드에서도 노출하지 않는다.

## 4. 기능 ① 로그인 / 신원식별

- **토큰:** `rater × session` 단위 서명 토큰을 개인화 URL(`/g/<token>`)로 발송. 서버가 토큰→(rater, period) 검증.
- **2요소:** 링크 접속 후 평가자별 정적 PIN(6자리, 링크와 다른 채널=문자로 전달) 입력 → 세션 개시. 대안: 이메일 OTP(별도 발송 인프라 필요, 스펙 병기).
- **신원 잠금:** 세션 시작 시 "P2 · 신OO 교수님 맞으신가요?" 1스텝 확인. 이후 모든 이벤트·답변에 `rater_id` 각인.
- **세션 게이팅:** Session 1 윈도 안에서만 채점. Session 2 토큰은 자동 자격계산 + 관리자 최종승인 전까지 비활성.
- **에러 처리:** PIN 실패/토큰 만료 시 명시적 안내 + 연구자 문의 링크. PIN 시도 제한(예: 5회/10분)으로 무차별 방지.

## 5. 스케줄 엔진 (기능 ③의 등뼈)

연구 셋업 시 평가자별로 서버가 1회 생성해 `assignments`에 고정(불변):
- 30 케이스를 **시드 RNG**(`raters.schedule_seed`)로 무작위 1:1 → α(15)/β(15). 시드 저장 → 사전등록·재현 가능.
- **S1:** α=Mode A, β=Mode B. **S2:** 조건 swap(α=Mode B, β=Mode A).
- 세션 내 A/B 케이스는 무작위 interleave(`order_index`). **S2 순서는 독립 재셔플**(별도 시드).
- 결과: 모든 (평가자×케이스)가 A·B 양쪽 보유 = fully paired. Item-level 관측치 ≈ 4×30×2×~20 ≈ 4,800.

**불변식(테스트 대상):** 각 rater는 정확히 15 α + 15 β; 각 (rater, case)는 S1·S2에서 서로 다른 mode; S2 order는 S1과 독립 셔플.

## 6. 기능 ③ 진행상황 추적

- **케이스 상태기계:** `not_started → in_progress`(case_enter) `→ submitted`(제출=잠금) `→ [관리자] unlocked → in_progress`.
- **세션 상태:** `locked → active`(윈도 개시) `→ done`(전 케이스 submitted).
- **재개:** 토큰 재접속 시 다음 미완 케이스로 이동. 케이스 내 답변은 서버 autosave 버퍼(제출 시 커밋). 네트워크 단절 대비 localStorage 임시버퍼.
- **평가자 대시보드:** 이번 세션 X/30 완료, 케이스별 상태칩.
- **H1 활성시간:** 이벤트 스트림으로 서버가 `active_ms` 누적. `case_enter → case_submit` 구간에서 idle 구간 차감. **idle 기준 = 무조작 60초**(사전등록 상수, 조정 가능).
- **wash-out 로깅:** S1완료시각~S2시작시각 간격 기록(사후 covariate).

## 7. 기능 ② 이벤트 로깅 (권위 원본)

companion 문서(`event_analytics_bottleneck_260525.html`)가 부재하므로 스키마를 본 스펙에서 확정한다.

- **단일 엔드포인트** `POST /api/events` (배치 전송 + `sendBeacon` on unload).
- **서버가 `server_ts` · `rater_id` · `assignment_id` · `mode` · `section`을 세션 컨텍스트에서 각인**(클라이언트 값 불신). append-only, 수정 불가.
- **이벤트 분류(초안):**
  - 세션: `login`, `identity_confirm`, `session_start`, `session_resume`, `session_complete`
  - 케이스: `case_enter`, `case_exit`, `case_submit`, `case_reopen`(admin)
  - 영상: `play`, `pause`, `seek`, `ratechange_attempt`(배속 잠금이므로 시도만 로깅)
  - 섹션/항목: `section_enter`, `item_focus`, `item_decide{value}`, `item_revise`
  - Mode B: `transcript_reveal`, `timestamp_jump{item_id, from_t, to_t=−10초보정}`, `evidence_view`
  - 메타: `idle_start`, `idle_end`, `heartbeat`
- **멱등성:** 각 이벤트에 클라이언트 생성 uuid → 서버 dedup(재전송 안전).
- **신뢰성:** 클라이언트가 localStorage에 버퍼링, 재시도 flush, `pagehide` 시 `sendBeacon`.
- **분석:** Postgres → pandas 추출로 dwell heatmap, transition variant, timestamp-jump latency, backtracking rate, evaluator archetype 도출. PostHog self-host는 후속 옵션.

## 8. 채점 런타임 (현 `AceApp` 확장)

- 현 단일페이지 → 라우팅 플로우: `/g/<token>` → PIN·신원확인 → 세션 셸 → 케이스 러너(스케줄이 한 케이스씩 서빙).
- **Mode는 사용자 토글 아님** — `assignment.mode`가 구동.
  - **Mode A:** AI 근거행 + timestamp 버튼 완전 숨김(빈 체크리스트).
  - **Mode B:** 항목별 근거 발화 + timestamp 점프.
  - **AI Yes/No verdict는 어느 모드에도 미노출**(현 코드가 이미 `evidence`만 노출 — 유지).
- **척도 수정(현 코드 결함):** 현 `Score = 3|2|1`을 항목 척도 인지형으로 교체.
  - **Hx / Edu = binary (0/1 = Yes/No)**
  - **PEx = triple (우수/보통/미흡)**
  - `answers.value`를 `checklist_items.scale` 기준으로 검증.
- **timestamp 점프:** `max(0, t−10)` 보정 + `timestamp_jump` 이벤트 emit.
- **배속 1.0 고정:** playback rate UI 비활성 + 가드(`ratechange_attempt` 로깅).
- 3뷰 동기 플레이어 자체는 별도 Plan(기존 `2026-07-01-ace-3view-player.md`) — 본 설계는 그 주위에 모드·체크리스트·로깅을 통합. 케이스는 사전처리 영상 URL + `case_content`(⑤ 산출) 로드.

## 9. 기능 ④ 백오피스

- **접근:** Supabase Auth 사용자(송지우·김민성)를 `admins`에. 평가자 토큰과 완전 분리. RLS: 관리자 전체 read, 평가자는 본인 행만.
- **기능:**
  1. 진행 매트릭스 — 평가자×케이스×세션×모드 그리드, 상태칩 + 완료율.
  2. 세션 관리 — S2 자격 목록(자동계산) → 승인 버튼. 윈도 개폐, 리마인더(7/12/14일) 상태.
  3. 케이스 잠금 관리 — submitted 케이스 unlock(사유 + 감사로그).
  4. 이벤트 탐색기 — (평가자,케이스)별 이벤트 타임라인·필터.
  5. 데이터 익스포트 — answers/progress/events → CSV/JSON(pandas) + GS·AI-alone 정확도 테이블.
  6. 전사문 교정 게이트(⑤ 연결) — 케이스별 전사문+근거 검토·수정 → freeze.
  7. wash-out 모니터링 — 평가자별 S1완료~S2시작 간격.
- **감사:** 관리자 액션(unlock/approve/freeze)에 `admin_id + ts + reason`을 `audit_log`에 기록.

## 10. 기능 ⑤ 전사문 1차 추출 (Python 파이프라인 연장)

기존 `feat/video-pipeline` 브랜치의 파이프라인을 연장한다.

- **입력:** encounter별 사전처리 오디오(파이프라인이 이미 추출).
- **1단계 ASR:** 클라우드 ASR(Clova 권장 / OpenAI 대안) → segment 타임스탬프 + 화자 분리(학생 vs SP). 산출 `transcript.json` (현 `TranscriptSegment{id,start,end,text,timestamp,speaker}` 형과 일치).
- **2단계 근거 매핑:** LLM이 체크리스트 항목별 근거 발화 + timestamp 추출 = 현 `/api/evaluate`(`AiEvaluation{questionId, evidence[]}`) 재사용. AI Yes/No verdict도 산출하되 `ai_alone` 테이블에만(평가자 비노출).
- **LLM 동결:** 단일 모델 버전·파라미터 사전등록(계획서 요구), `case_content.model_id` 기록.
- **3단계 게이트:** 1차 자동 → 백오피스 ⑥에서 수동 교정 → `frozen=true`. frozen만 Mode B로 서빙.
- **IRB:** 오디오가 클라우드 ASR로 나감 → 처리환경 명시 + 2차활용 동의 범위 확인.

## 11. 테스트 / 롤아웃

- **파이프라인(⑤):** 순수로직 TDD(기존 파이프라인 패턴), ASR/LLM은 인터페이스 뒤로 mock.
- **앱:**
  - 스케줄 엔진 — 시드 RNG로 결정론적 단위테스트(α/β split, swap, interleave, reshuffle, fully-paired 불변식).
  - 인증/PIN — 토큰 검증, PIN 락아웃, 세션 게이팅.
  - 이벤트 — 멱등/dedup, 서버 각인, sendBeacon 경로.
  - 활성시간/idle 계산 — 이벤트 시퀀스 단위테스트.
  - E2E — 케이스당 모드별 채점 플로우 1건.
- **파일럿(계획서 요구):** 본 채점 전 1~2 케이스 × 1~2 외부 reviewer — UI흐름·이벤트정확도·영상 프리로드·네트워크 단절 검증.
- **롤아웃 순서:** 기반(DB/인증) → 스케줄 → 런타임(A/B·척도) → 이벤트 → 진행 대시보드 → 백오피스 → ⑤ 파이프라인+교정 → 파일럿.
- **마이그레이션:** 현 단일페이지 프로토타입(video1.mp4, checklist.json, localStorage) → 라우팅 케이스러너로 리팩터. 컴포넌트(ViewGrid/TranscriptBar/EvaluationPanel/ChecklistQuestion) 및 `/api/evaluate` 재사용.

## 12. 구현 분해 (writing-plans 단계에서 상세화)

전체 5기능은 한 스펙이되 구현은 자연히 4개 plan으로 분해된다:
1. **기반 + 채점 런타임** — Supabase 스키마·RLS, 토큰+PIN 인증, 스케줄 엔진, Mode A/B 라우팅 케이스러너, 척도 수정.
2. **이벤트 + 진행** — `/api/events` 권위 로그, 활성시간/idle, 평가자 진행 대시보드, 재개/autosave.
3. **백오피스** — 관리자 인증, 진행 매트릭스, 세션 승인, 잠금 관리, 익스포트, 전사문 교정 게이트, 감사로그.
4. **전사문 파이프라인(⑤)** — ASR + 근거매핑 + 동결 + 교정 연동 (기존 파이프라인 연장).

## 13. 미결 / IRB 명시 사항

- ASR 벤더 최종 확정(Clova vs OpenAI) — 파일럿에서 한국어 의료 품질 대조 후.
- **앱 호스팅 위치 확정(Vercel vs 자체호스팅) + 리전** — 서버 타임스탬프·`/api/events` 권위 엔드포인트가 도는 곳이므로 IRB 관련. Supabase(서울)와의 왕복 지연 고려. 자체호스팅이면 IRB 데이터흐름 서사가 더 단순.
- IRB 제출서에 명시: (a) Supabase 서울 리전 + DPA, (b) 클라우드 ASR 오디오 처리환경 및 2차활용 동의 범위, (c) 앱 서버 호스팅 위치.
- idle 60초, 비열등성 마진(5%p, κ0.10), wash-out covariate 모형은 연구계획서 의사결정 패널에서 교신저자 확정 대상 — 앱은 상수/설정으로 파라미터화.
- LLM 모델 버전·파라미터 사전등록 위치(OSF/IRB 첨부).
