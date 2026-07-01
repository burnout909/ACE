# CPX Plan 3 — 백오피스 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** 연구자용 관리 대시보드 — 진행 매트릭스, Session 2 승인, 케이스 잠금 관리, 데이터 익스포트, 전사문 교정 게이트, 감사로그.

**Architecture:** 별도 `/admin` 영역을 Supabase Auth(연구팀 계정)로 보호. RLS: 관리자 전체 read, 평가자 토큰과 완전 분리. 집계/익스포트는 순수 함수로 TDD, 나머지는 CRUD/UI.

**Tech Stack:** Plan 1/2 + `@supabase/ssr`(관리자 세션), CSV 직렬화.

## Global Constraints
- 근거 스펙 §9. Plan 1(스키마·assignments·case_progress·answers), Plan 2(events·`isSession2Eligible`) 전제.
- 관리자 액션(unlock/approve/freeze)은 `audit_log`에 `admin_id+action+target+reason+ts` 필수.
- Session 2 개방 = 관리자 승인 시 `sessions.status='active'` + `window_open_at`.

## File Structure
- `lib/db/admin.sql` — `admins`, `audit_log` 테이블 + RLS.
- `lib/study/matrix.ts` (+`.test.ts`) — assignments+progress → 평가자×케이스×세션 매트릭스 집계.
- `lib/study/export.ts` (+`.test.ts`) — answers/progress/events → CSV 행.
- `app/admin/layout.tsx` — Supabase Auth 게이트.
- `app/admin/page.tsx` — 진행 매트릭스.
- `app/admin/sessions/page.tsx` — S2 자격목록 + 승인, 윈도 개폐.
- `app/api/admin/approve-session/route.ts`, `app/api/admin/unlock-case/route.ts`, `app/api/admin/export/route.ts`, `app/api/admin/freeze-content/route.ts`.
- `app/admin/transcripts/[caseId]/page.tsx` — 전사문 교정 게이트(⑤ 연결).

---

## Task 1: 관리자 테이블/인증 게이트
**Files:** Create `lib/db/admin.sql`, `app/admin/layout.tsx`
- [ ] **Step 1: 스키마**
```sql
create table admins (id uuid primary key, email text unique not null);
create table audit_log (
  id bigserial primary key, admin_id uuid references admins(id),
  action text not null, target text, reason text, ts timestamptz not null default now()
);
```
- [ ] **Step 2: 레이아웃 게이트** — `@supabase/ssr`로 로그인 확인, `admins`에 이메일 없으면 접근 차단. 송지우·김민성 이메일 시드.
- [ ] **Step 3: 확인** — 비관리자 → 차단, 관리자 → 통과.
- [ ] **Step 4: Commit** — `git commit -m "feat(admin): admin tables and auth-gated /admin"`

---

## Task 2: 진행 매트릭스 집계 (순수 로직, TDD)
**Files:** Create `lib/study/matrix.ts`, Test `lib/study/matrix.test.ts`
**Interfaces:** `function buildMatrix(rows: {raterId:string;caseId:number;period:1|2;mode:"A"|"B";state:string}[]): { raterId:string; cells: Record<string, {mode:string;state:string}> }[]` — 키 `"case:period"`.
- [ ] **Step 1: 실패 테스트**
```ts
import { describe, it, expect } from "vitest";
import { buildMatrix } from "@/lib/study/matrix";
it("groups by rater with case:period cells", () => {
  const m = buildMatrix([
    { raterId: "P1", caseId: 3, period: 1, mode: "A", state: "submitted" },
    { raterId: "P1", caseId: 3, period: 2, mode: "B", state: "not_started" },
  ]);
  expect(m).toHaveLength(1);
  expect(m[0].cells["3:1"]).toEqual({ mode: "A", state: "submitted" });
  expect(m[0].cells["3:2"]).toEqual({ mode: "B", state: "not_started" });
});
```
- [ ] **Step 2: 실패 확인** → FAIL.
- [ ] **Step 3: 구현**
```ts
export function buildMatrix(rows: {raterId:string;caseId:number;period:1|2;mode:"A"|"B";state:string}[]) {
  const byRater = new Map<string, Record<string, {mode:string;state:string}>>();
  for (const r of rows) {
    const cells = byRater.get(r.raterId) ?? {};
    cells[`${r.caseId}:${r.period}`] = { mode: r.mode, state: r.state };
    byRater.set(r.raterId, cells);
  }
  return [...byRater].map(([raterId, cells]) => ({ raterId, cells }));
}
```
- [ ] **Step 4: 통과 확인** → PASS.
- [ ] **Step 5: 매트릭스 페이지** — `app/admin/page.tsx`에서 assignments⨝case_progress 로드 → `buildMatrix` → 그리드(상태칩·완료율). Commit `git commit -m "feat(admin): progress matrix aggregation and view"`

---

## Task 3: Session 2 승인 + 윈도 개폐
**Files:** Create `app/admin/sessions/page.tsx`, `app/api/admin/approve-session/route.ts`
**Interfaces:** Consumes Plan 2 `isSession2Eligible`. `POST` `{raterId}` → `sessions(period=2).status='active'`, `window_open_at=now`, `audit_log` 기록.
- [ ] **Step 1: 자격목록 페이지** — 각 rater S1 완료시각(가장 늦은 submit_at) + `isSession2Eligible` 계산 → 후보 목록에 "승인" 버튼.
- [ ] **Step 2: 승인 API** — 관리자 확인 후 sessions 업데이트 + 감사로그. 윈도 개/폐 토글도 포함.
- [ ] **Step 3: 확인** — 미자격 rater는 승인 비활성, 승인 시 해당 토큰 활성화.
- [ ] **Step 4: Commit** — `git commit -m "feat(admin): session 2 eligibility list and approval with audit"`

---

## Task 4: 케이스 잠금 관리 (unlock)
**Files:** Create `app/api/admin/unlock-case/route.ts`
**Interfaces:** `POST {assignmentId, reason}` → `case_progress.state`가 submitted면 `in_progress`로, `audit_log` 기록.
- [ ] **Step 1: API 구현** — reason 필수, 감사로그 필수.
- [ ] **Step 2: 매트릭스 셀에 unlock 액션 연결** — submitted 셀 우클릭/버튼 → reason 입력 → 호출.
- [ ] **Step 3: 확인** — unlock 후 평가자 재접속 시 해당 케이스 재개 가능.
- [ ] **Step 4: Commit** — `git commit -m "feat(admin): case unlock with mandatory reason and audit"`

---

## Task 5: 데이터 익스포트 (순수 직렬화, TDD)
**Files:** Create `lib/study/export.ts`, Test `lib/study/export.test.ts`, `app/api/admin/export/route.ts`
**Interfaces:** `function toCsv(headers: string[], rows: (string|number)[][]): string` — RFC4180 이스케이프.
- [ ] **Step 1: 실패 테스트**
```ts
import { describe, it, expect } from "vitest";
import { toCsv } from "@/lib/study/export";
it("escapes commas and quotes", () => {
  expect(toCsv(["a","b"], [["x,y", 'q"z']])).toBe('a,b\n"x,y","q""z"');
});
```
- [ ] **Step 2: 실패 확인** → FAIL.
- [ ] **Step 3: 구현**
```ts
function cell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCsv(headers: string[], rows: (string | number)[][]): string {
  return [headers, ...rows].map((r) => r.map(cell).join(",")).join("\n");
}
```
- [ ] **Step 4: 통과 확인** → PASS.
- [ ] **Step 5: 익스포트 API** — `GET /api/admin/export?kind=answers|progress|events` → `toCsv`로 CSV 다운로드. GS·AI-alone 정확도 테이블도 동일 경로. Commit `git commit -m "feat(admin): CSV export for answers/progress/events"`

---

## Task 6: 전사문 교정 게이트 (⑤ 연결)
**Files:** Create `app/admin/transcripts/[caseId]/page.tsx`, `app/api/admin/freeze-content/route.ts`
**Interfaces:** `case_content{transcript, evidence, frozen}` 편집 UI → `POST freeze` → `frozen=true`, 감사로그. **frozen=true만 Mode B로 서빙**(Plan 1 case 로드에서 `frozen` 아니면 evidence 미제공).
- [ ] **Step 1: 교정 UI** — 케이스별 transcript 세그먼트 + 항목별 evidence 편집(텍스트·timestamp 수정). Plan 4가 1차 자동 산출을 채워둠.
- [ ] **Step 2: freeze API** — 검토 완료 시 frozen 세팅 + 감사로그. Plan 1 case GET에서 Mode B라도 `frozen` 아니면 evidence 빈 배열로 서빙(미완 콘텐츠 노출 방지).
- [ ] **Step 3: 확인** — freeze 전 Mode B 케이스는 evidence 안 보임, freeze 후 보임.
- [ ] **Step 4: Commit** — `git commit -m "feat(admin): transcript correction gate and content freeze"`

---

## Self-Review
- 스펙 커버리지 §9: 진행매트릭스=Task2; S2승인=Task3; 잠금=Task4; 익스포트=Task5; 교정게이트=Task6; 감사=전 태스크 audit_log; wash-out 모니터=Task3 자격목록. 이벤트 탐색기는 Task5 익스포트+매트릭스 드릴다운으로 충족(별도 대형 UI는 YAGNI, 필요시 후속).
- 순수로직 TDD: `buildMatrix`(Task2), `toCsv`(Task5).
- 타입 일관성: `isSession2Eligible`(Plan2)·`case_content.frozen`(Plan1 로드와 Task6 일치).
