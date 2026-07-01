# CPX Plan 2 — 이벤트 로깅 + 진행 추적 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** 권위 이벤트 로그(Postgres)와 진행상태(H1 활성시간·재개·평가자 대시보드·Session 2 자격계산)를 구현한다.

**Architecture:** 클라이언트가 이벤트를 배치로 `/api/events`에 전송(sendBeacon on unload). 서버가 `server_ts`·`rater_id`·`mode`·`section`을 세션 컨텍스트로 각인, uuid로 dedup. 순수 함수가 이벤트 스트림 → `active_ms`(idle 60초 차감)와 Session 2 자격을 계산.

**Tech Stack:** Plan 1과 동일 + `crypto.randomUUID`(클라이언트 이벤트 id).

## Global Constraints

- 근거 스펙 §7(이벤트), §6(진행). Plan 1 인터페이스(`getServerClient`, `verifyToken`, `Mode`) 전제.
- 이벤트는 append-only·서버 각인·멱등. idle 임계 = **무조작 60초**(상수 `IDLE_MS`).
- 시도 제한(Plan 1 Task 7 이월): 최근 10분 5회 → 423.

## File Structure

- `lib/study/activeTime.ts` (+`.test.ts`) — 이벤트 스트림 → active_ms(idle 차감).
- `lib/study/eligibility.ts` (+`.test.ts`) — Session 2 자격(S1 done + wash-out 경과).
- `lib/db/events.sql` — `events` 테이블(+ index).
- `app/api/events/route.ts` — 배치 수신·각인·dedup.
- `lib/events/client.ts` — 클라이언트 버퍼/flush/sendBeacon.
- `app/api/progress/route.ts` — 평가자 본인 진행 요약.
- `app/g/[token]/ProgressDashboard.tsx` — X/30 + 케이스 상태칩.

---

## Task 1: 활성시간 계산 (순수 로직, TDD)

**Files:** Create `lib/study/activeTime.ts`, Test `lib/study/activeTime.test.ts`

**Interfaces:**
- Produces: `function activeMs(events: {serverTs:number}[], idleMs?: number): number` — 인접 이벤트 간격이 `idleMs`(기본 60000) 초과면 그 간격을 제외한 총 경과.

- [ ] **Step 1: 실패 테스트**
```ts
import { describe, it, expect } from "vitest";
import { activeMs } from "@/lib/study/activeTime";

describe("activeMs", () => {
  it("sums gaps but excludes idle stretches over threshold", () => {
    const ev = [0, 5_000, 10_000, 200_000, 205_000].map((t) => ({ serverTs: t }));
    // 10s active + [200s 간격 idle 제외] + 5s active = 15_000
    expect(activeMs(ev, 60_000)).toBe(15_000);
  });
  it("returns 0 for fewer than 2 events", () => {
    expect(activeMs([{ serverTs: 1 }])).toBe(0);
  });
});
```
- [ ] **Step 2: 실패 확인** — Run `npx vitest run lib/study/activeTime.test.ts` → FAIL.
- [ ] **Step 3: 구현**
```ts
export function activeMs(events: { serverTs: number }[], idleMs = 60_000): number {
  const ts = events.map((e) => e.serverTs).sort((a, b) => a - b);
  let total = 0;
  for (let i = 1; i < ts.length; i++) {
    const gap = ts[i] - ts[i - 1];
    if (gap <= idleMs) total += gap;
  }
  return total;
}
```
- [ ] **Step 4: 통과 확인** — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(study): active-time computation with idle exclusion"`

---

## Task 2: Session 2 자격 계산 (순수 로직, TDD)

**Files:** Create `lib/study/eligibility.ts`, Test `lib/study/eligibility.test.ts`

**Interfaces:**
- Produces: `function isSession2Eligible(s1CompletedAt: number|null, now: number, washoutDays?: number): boolean` — S1 완료 & 경과 ≥ washout(기본 14일).

- [ ] **Step 1: 실패 테스트**
```ts
import { describe, it, expect } from "vitest";
import { isSession2Eligible } from "@/lib/study/eligibility";
const DAY = 86_400_000;
describe("isSession2Eligible", () => {
  it("false until session 1 complete", () => expect(isSession2Eligible(null, 0)).toBe(false));
  it("false before washout, true after", () => {
    const done = 1_000_000_000;
    expect(isSession2Eligible(done, done + 13 * DAY, 14)).toBe(false);
    expect(isSession2Eligible(done, done + 15 * DAY, 14)).toBe(true);
  });
});
```
- [ ] **Step 2: 실패 확인** → FAIL.
- [ ] **Step 3: 구현**
```ts
const DAY = 86_400_000;
export function isSession2Eligible(s1CompletedAt: number | null, now: number, washoutDays = 14): boolean {
  if (s1CompletedAt == null) return false;
  return now - s1CompletedAt >= washoutDays * DAY;
}
```
- [ ] **Step 4: 통과 확인** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(study): session 2 eligibility (S1 done + washout)"`
> 주: 자격은 계산일 뿐, 실제 개방은 **관리자 승인**(Plan 3)에서 `sessions.status='active'` 세팅.

---

## Task 3: events 테이블 + 수신 API (각인·dedup)

**Files:** Create `lib/db/events.sql`, `app/api/events/route.ts`

**Interfaces:**
- Consumes: `getServerClient`, `verifyToken`(쿠키 `sid`).
- Produces: `POST /api/events` body `{ events: {id,type,payload,clientTs,assignmentId,section}[] }` → 서버가 `rater_id`·`mode`·`server_ts` 각인, `id`로 dedup upsert.

- [ ] **Step 1: 스키마**
`lib/db/events.sql`:
```sql
create table events (
  id uuid primary key,                 -- 클라이언트 생성, dedup 키
  rater_id text not null references raters(id),
  assignment_id bigint references assignments(id),
  type text not null,
  payload jsonb not null default '{}',
  section text,
  mode text check (mode in ('A','B')),
  client_ts timestamptz,
  server_ts timestamptz not null default now()
);
create index events_rater_case_idx on events (rater_id, assignment_id, server_ts);
alter table events enable row level security;
create policy "no direct anon" on events for all to anon using (false);
```
- [ ] **Step 2: 라우트**
`app/api/events/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth/token";
import { getServerClient } from "@/lib/db/client";

export async function POST(req: NextRequest) {
  const token = req.cookies.get("sid")?.value ?? "";
  const claim = verifyToken(token, process.env.SESSION_TOKEN_SECRET!);
  if (!claim) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { events } = await req.json();
  const db = getServerClient();

  // assignment→mode 매핑(각인용). 클라이언트 mode 신뢰 안 함.
  const ids = [...new Set(events.map((e: any) => e.assignmentId).filter(Boolean))];
  const { data: as } = await db.from("assignments").select("id,mode,rater_id").in("id", ids);
  const modeOf = new Map((as ?? []).map((a) => [a.id, a.mode]));

  const rows = events
    .filter((e: any) => !e.assignmentId || (as ?? []).some((a) => a.id === e.assignmentId && a.rater_id === claim.raterId))
    .map((e: any) => ({
      id: e.id, rater_id: claim.raterId, assignment_id: e.assignmentId ?? null,
      type: e.type, payload: e.payload ?? {}, section: e.section ?? null,
      mode: e.assignmentId ? modeOf.get(e.assignmentId) : null,
      client_ts: e.clientTs ? new Date(e.clientTs).toISOString() : null,
    }));
  await db.from("events").upsert(rows, { onConflict: "id", ignoreDuplicates: true });
  return NextResponse.json({ ok: true, stored: rows.length });
}
```
- [ ] **Step 3: 수동 확인** — 같은 `id` 재전송 → 중복 저장 안 됨(멱등). 타 rater assignment는 필터됨.
- [ ] **Step 4: Commit** — `git add lib/db/events.sql app/api/events && git commit -m "feat(events): authoritative append-only event log with server stamping and dedup"`

---

## Task 4: 클라이언트 이벤트 버퍼 (배치·sendBeacon)

**Files:** Create `lib/events/client.ts`

**Interfaces:**
- Produces: `logEvent(type, payload?, ctx?)`, `flush()`; `pagehide`에서 `navigator.sendBeacon("/api/events", ...)`.

- [ ] **Step 1: 구현** — 이벤트를 배열 버퍼에 push(+`crypto.randomUUID()`, `clientTs=Date.now()`). 3초 주기 또는 20개마다 `fetch` flush(재시도), `pagehide`/`visibilitychange:hidden`에서 `sendBeacon`. 오프라인 시 `localStorage`에 임시 저장 후 재접속 flush.
- [ ] **Step 2: 런타임 연결** — Plan 1 `CaseRunner`/`AceApp`/`EvaluationPanel`에서 스펙 §7 분류대로 emit: `case_enter/exit/submit`, `play/pause/seek/ratechange_attempt`, `section_enter`, `item_focus/decide/revise`, (Mode B)`transcript_reveal/timestamp_jump/evidence_view`, `idle_start/end`, `heartbeat`.
- [ ] **Step 3: 수동 확인** — 채점 1케이스 후 `events` 테이블에 분류별 행 존재, unload 시 유실 없음.
- [ ] **Step 4: Commit** — `git commit -m "feat(events): client buffer with beacon flush and taxonomy emit"`

---

## Task 5: 진행 요약 API + 평가자 대시보드

**Files:** Create `app/api/progress/route.ts`, `app/g/[token]/ProgressDashboard.tsx`

**Interfaces:**
- Consumes: `getServerClient`, `verifyToken`, Task 1 `activeMs`.
- Produces: `GET /api/progress` → `{ total, done, cases: {assignmentId, orderIndex, state}[] }` (본인·현재 period 한정). 각 submitted 케이스의 `active_ms`는 `events`에서 `activeMs()`로 산출·`case_progress.active_ms` 갱신.

- [ ] **Step 1: 라우트** — assignments(현 period) + case_progress 조인, done=submitted 수. submitted 케이스별 `case_enter~case_submit` 이벤트로 `activeMs` 계산·저장.
- [ ] **Step 2: 대시보드 컴포넌트** — X/30 진행바 + 케이스 상태칩(not_started/in_progress/submitted). 스펙 §6.
- [ ] **Step 3: 수동 확인** — 케이스 제출 시 done 증가, active_ms 기록.
- [ ] **Step 4: Commit** — `git commit -m "feat(progress): rater progress API and dashboard with active-time"`

---

## Self-Review
- 스펙 커버리지: §7 이벤트(분류·각인·dedup·beacon)=Task 3·4; §6 진행(상태·활성시간·대시보드·wash-out자격)=Task 1·2·5. 관리자 승인/윈도개폐는 Plan 3.
- 타입 일관성: `activeMs`(Task1·5), `isSession2Eligible`(Task2, Plan3에서 소비), `verifyToken`/`getServerClient`(Plan1).
- 플레이스홀더: Task 4·5는 UI/emit 배선이라 명세 위주, 순수로직(Task1·2)은 완전 TDD.
