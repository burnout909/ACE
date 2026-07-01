# CPX Plan 1 — 기반 + 채점 런타임 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ACE 단일페이지 프로토타입을 다중 케이스·다중 평가자 연구 채점 런타임의 기반(DB·인증·스케줄·Mode A/B)으로 확장한다.

**Architecture:** Next.js 15 App Router + Supabase(Postgres, 서울 리전, RLS). 서버가 크로스오버 스케줄을 시드 RNG로 1회 생성해 불변 저장. 평가자는 토큰 URL + PIN 2요소로 세션 진입, `assignment.mode`가 Mode A/B UI를 구동. 순수로직(스케줄·인증·척도)은 vitest TDD, DB/UI 배선은 통합.

**Tech Stack:** Next.js 15.5.9, React 19, TypeScript 5.6, Tailwind 4, Supabase(`@supabase/supabase-js`, `@supabase/ssr`), vitest(순수로직 단위테스트), `@noble/hashes`(PIN/토큰 HMAC).

## Global Constraints

- 근거 스펙: `docs/superpowers/specs/2026-07-01-cpx-study-platform-design.md` (§1 결정, §3 데이터모델, §4 인증, §5 스케줄, §8 런타임).
- **AI Yes/No verdict는 어느 모드에서도 평가자 UI에 노출 금지.** Mode B는 `evidence`(근거발화+timestamp)만.
- **모든 연구 측정치는 서버 API 경유** — 클라이언트 localStorage는 임시버퍼(신뢰 원본 아님).
- 서버 타임스탬프가 진실. 클라이언트 시각 불신.
- 척도: **Hx/Edu = binary(0/1)**, **PEx = triple(1=미흡/2=보통/3=우수)**.
- 스케줄은 시드 RNG로 **결정론적·재현가능**. `assignments`는 생성 후 불변.
- Supabase 리전 = 서울(ap-northeast-2). 시크릿은 `.env.local`(커밋 금지).
- 배속 1.0 고정. Session 1 윈도 밖·미승인 Session 2는 채점 불가.

---

## File Structure

- `lib/db/schema.sql` — Supabase 스키마 + RLS 정책 (§3 테이블).
- `lib/db/client.ts` — 서버/브라우저 Supabase 클라이언트 팩토리.
- `lib/study/schedule.ts` — 순수 스케줄 엔진(시드 RNG, α/β split, swap, interleave, reshuffle).
- `lib/study/schedule.test.ts` — 스케줄 불변식 테스트.
- `lib/study/scale.ts` — 척도별 답변 검증(binary/triple).
- `lib/study/scale.test.ts` — 척도 검증 테스트.
- `lib/auth/token.ts` — rater×session 서명 토큰 생성/검증(HMAC).
- `lib/auth/token.test.ts` — 토큰 테스트.
- `lib/auth/pin.ts` — PIN 해시/검증 + 시도 제한 로직(순수 부분).
- `lib/auth/pin.test.ts` — PIN 테스트.
- `app/api/session/route.ts` — 토큰+PIN 검증 → 세션 컨텍스트 발급.
- `app/api/case/[assignmentId]/route.ts` — 케이스 로드/enter.
- `app/api/case/[assignmentId]/submit/route.ts` — 제출=잠금.
- `app/g/[token]/page.tsx` — 진입(PIN·신원확인) → 세션 셸.
- `app/g/[token]/CaseRunner.tsx` — 스케줄 기반 케이스 러너(현 `AceApp` 리팩터).
- `lib/types.ts` — 기존 타입 확장(척도 인지형 `AnswerValue`).
- `vitest.config.ts`, `package.json` — 테스트 러너 추가.

---

## Task 1: 테스트 러너 + 프로젝트 배선

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

**Interfaces:**
- Produces: `npm test` (vitest run), `npm run test:watch`.

- [ ] **Step 1: vitest 설정 작성**

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node", include: ["lib/**/*.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
```

- [ ] **Step 2: package.json 스크립트/의존성 추가**

`package.json`의 `scripts`에 추가:
```json
"test": "vitest run",
"test:watch": "vitest"
```
devDependencies에 추가 후 설치:
```bash
npm i -D vitest@^2 && npm i @supabase/supabase-js @supabase/ssr @noble/hashes
```

- [ ] **Step 3: 스모크 테스트로 러너 확인**

`lib/study/scale.test.ts`(임시):
```ts
import { it, expect } from "vitest";
it("runner works", () => expect(1 + 1).toBe(2));
```

- [ ] **Step 4: 실행**

Run: `npm test`
Expected: PASS (1 test). 이후 Task 4에서 이 파일을 실제 테스트로 교체.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts lib/study/scale.test.ts
git commit -m "chore: add vitest runner and study deps"
```

---

## Task 2: 스케줄 엔진 (순수 로직, TDD 핵심)

**Files:**
- Create: `lib/study/schedule.ts`
- Test: `lib/study/schedule.test.ts`

**Interfaces:**
- Produces:
  - `type Mode = "A" | "B"`
  - `type Assignment = { caseId: number; period: 1 | 2; mode: Mode; orderIndex: number }`
  - `function buildSchedule(caseIds: number[], seed: number): Assignment[]` — 한 평가자의 전체 스케줄(길이 = caseIds.length × 2).

- [ ] **Step 1: 실패 테스트 작성 — 시드 결정론 + 크기**

```ts
import { describe, it, expect } from "vitest";
import { buildSchedule } from "@/lib/study/schedule";

const CASES = Array.from({ length: 30 }, (_, i) => i + 1);

describe("buildSchedule", () => {
  it("is deterministic for a given seed and covers 30 cases × 2 periods", () => {
    const a = buildSchedule(CASES, 12345);
    const b = buildSchedule(CASES, 12345);
    expect(a).toEqual(b);
    expect(a).toHaveLength(60);
    expect(buildSchedule(CASES, 999)).not.toEqual(a); // 다른 시드 → 다른 배정
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run lib/study/schedule.test.ts`
Expected: FAIL ("buildSchedule is not a function").

- [ ] **Step 3: 최소 구현 — 시드 RNG + α/β split + swap + interleave**

`lib/study/schedule.ts`:
```ts
export type Mode = "A" | "B";
export type Assignment = {
  caseId: number;
  period: 1 | 2;
  mode: Mode;
  orderIndex: number;
};

// mulberry32: 작고 결정론적인 시드 PRNG
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildSchedule(caseIds: number[], seed: number): Assignment[] {
  const rand = rng(seed);
  const shuffled = shuffle(caseIds, rand);
  const half = Math.floor(shuffled.length / 2);
  const alpha = new Set(shuffled.slice(0, half));   // S1=A, S2=B
  // beta = 나머지                                    // S1=B, S2=A

  const modeFor = (caseId: number, period: 1 | 2): Mode => {
    const inAlpha = alpha.has(caseId);
    if (period === 1) return inAlpha ? "A" : "B";
    return inAlpha ? "B" : "A";
  };

  const out: Assignment[] = [];
  for (const period of [1, 2] as const) {
    // 세션 내 무작위 interleave. S2는 독립 재셔플(별도 시드 파생).
    const orderRand = period === 1 ? rand : rng(seed ^ 0x9e3779b9);
    const order = shuffle(caseIds, orderRand);
    order.forEach((caseId, orderIndex) => {
      out.push({ caseId, period, mode: modeFor(caseId, period), orderIndex });
    });
  }
  return out;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run lib/study/schedule.test.ts`
Expected: PASS.

- [ ] **Step 5: 불변식 테스트 추가 — fully-paired · α/β 균형 · S2 독립순서**

테스트 파일에 추가:
```ts
it("each case appears once per period with opposite modes (fully paired)", () => {
  const s = buildSchedule(CASES, 7);
  for (const caseId of CASES) {
    const rows = s.filter((r) => r.caseId === caseId);
    expect(rows).toHaveLength(2);
    const modes = rows.map((r) => r.mode).sort();
    expect(modes).toEqual(["A", "B"]); // 두 세션에서 서로 다른 모드
  }
});

it("splits 30 cases into 15 A / 15 B in session 1", () => {
  const s1 = buildSchedule(CASES, 7).filter((r) => r.period === 1);
  expect(s1.filter((r) => r.mode === "A")).toHaveLength(15);
  expect(s1.filter((r) => r.mode === "B")).toHaveLength(15);
});

it("session 2 order is an independent reshuffle of session 1 order", () => {
  const s = buildSchedule(CASES, 7);
  const order1 = s.filter((r) => r.period === 1).sort((a, b) => a.orderIndex - b.orderIndex).map((r) => r.caseId);
  const order2 = s.filter((r) => r.period === 2).sort((a, b) => a.orderIndex - b.orderIndex).map((r) => r.caseId);
  expect(order2).not.toEqual(order1);           // 순서 재셔플됨
  expect([...order2].sort()).toEqual([...order1].sort()); // 같은 30 케이스 집합
});
```

- [ ] **Step 6: 통과 확인 후 Commit**

Run: `npx vitest run lib/study/schedule.test.ts` → PASS
```bash
git add lib/study/schedule.ts lib/study/schedule.test.ts
git commit -m "feat(study): seeded crossover schedule engine with fully-paired invariants"
```

---

## Task 3: 척도 인지형 답변 검증 (순수 로직, TDD)

**Files:**
- Create: `lib/study/scale.ts`
- Test: `lib/study/scale.test.ts` (Task 1의 스모크 파일 교체)
- Modify: `lib/types.ts`

**Interfaces:**
- Produces:
  - `type Scale = "binary" | "triple"`
  - `type AnswerValue = 0 | 1 | 2 | 3`
  - `function isValidAnswer(scale: Scale, value: number): value is AnswerValue`
  - `function allowedValues(scale: Scale): AnswerValue[]`

- [ ] **Step 1: 실패 테스트 작성**

`lib/study/scale.test.ts` (스모크 내용 대체):
```ts
import { describe, it, expect } from "vitest";
import { isValidAnswer, allowedValues } from "@/lib/study/scale";

describe("scale validation", () => {
  it("binary allows only 0 or 1", () => {
    expect(isValidAnswer("binary", 0)).toBe(true);
    expect(isValidAnswer("binary", 1)).toBe(true);
    expect(isValidAnswer("binary", 2)).toBe(false);
    expect(allowedValues("binary")).toEqual([0, 1]);
  });
  it("triple allows 1,2,3 (미흡/보통/우수), not 0", () => {
    expect(isValidAnswer("triple", 1)).toBe(true);
    expect(isValidAnswer("triple", 3)).toBe(true);
    expect(isValidAnswer("triple", 0)).toBe(false);
    expect(allowedValues("triple")).toEqual([1, 2, 3]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run lib/study/scale.test.ts`
Expected: FAIL (모듈 없음).

- [ ] **Step 3: 최소 구현**

`lib/study/scale.ts`:
```ts
export type Scale = "binary" | "triple";
export type AnswerValue = 0 | 1 | 2 | 3;

export function allowedValues(scale: Scale): AnswerValue[] {
  return scale === "binary" ? [0, 1] : [1, 2, 3];
}

export function isValidAnswer(scale: Scale, value: number): value is AnswerValue {
  return (allowedValues(scale) as number[]).includes(value);
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run lib/study/scale.test.ts`
Expected: PASS.

- [ ] **Step 5: 타입 확장 후 Commit**

`lib/types.ts`에서 `Score` 제거·대체:
```ts
// 제거: export type Score = 3 | 2 | 1;
export type { Scale, AnswerValue } from "@/lib/study/scale";

export type ChecklistQuestion = {
  id: string;
  title: string;
  criteria: string;
  scale: import("@/lib/study/scale").Scale; // 항목별 척도
};
```
```bash
git add lib/study/scale.ts lib/study/scale.test.ts lib/types.ts
git commit -m "feat(study): scale-aware answer validation (binary Hx/Edu, triple PEx)"
```

---

## Task 4: rater×session 서명 토큰 (순수 로직, TDD)

**Files:**
- Create: `lib/auth/token.ts`
- Test: `lib/auth/token.test.ts`

**Interfaces:**
- Produces:
  - `function signToken(raterId: string, period: 1 | 2, secret: string): string`
  - `function verifyToken(token: string, secret: string): { raterId: string; period: 1 | 2 } | null` — 위조/변조 시 `null`.

- [ ] **Step 1: 실패 테스트 작성**

```ts
import { describe, it, expect } from "vitest";
import { signToken, verifyToken } from "@/lib/auth/token";

const SECRET = "test-secret-please-change";

describe("session token", () => {
  it("round-trips rater and period", () => {
    const t = signToken("P2", 1, SECRET);
    expect(verifyToken(t, SECRET)).toEqual({ raterId: "P2", period: 1 });
  });
  it("rejects tampered payload", () => {
    const t = signToken("P2", 1, SECRET);
    const tampered = t.replace("P2", "P3");
    expect(verifyToken(tampered, SECRET)).toBeNull();
  });
  it("rejects wrong secret", () => {
    const t = signToken("P2", 1, SECRET);
    expect(verifyToken(t, "other-secret")).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run lib/auth/token.test.ts`
Expected: FAIL.

- [ ] **Step 3: 최소 구현 (HMAC-SHA256, base64url)**

`lib/auth/token.ts`:
```ts
import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";

function b64url(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}
function unb64url(s: string): string {
  return Buffer.from(s, "base64url").toString("utf8");
}
function mac(payload: string, secret: string): string {
  return bytesToHex(hmac(sha256, utf8ToBytes(secret), utf8ToBytes(payload)));
}

export function signToken(raterId: string, period: 1 | 2, secret: string): string {
  const payload = b64url(JSON.stringify({ raterId, period }));
  return `${payload}.${mac(payload, secret)}`;
}

export function verifyToken(
  token: string,
  secret: string
): { raterId: string; period: 1 | 2 } | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  if (mac(payload, secret) !== sig) return null;
  try {
    const { raterId, period } = JSON.parse(unb64url(payload));
    if ((period !== 1 && period !== 2) || typeof raterId !== "string") return null;
    return { raterId, period };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run lib/auth/token.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/auth/token.ts lib/auth/token.test.ts
git commit -m "feat(auth): HMAC-signed rater×session tokens"
```

---

## Task 5: PIN 해시/검증 + 시도 제한 (순수 로직, TDD)

**Files:**
- Create: `lib/auth/pin.ts`
- Test: `lib/auth/pin.test.ts`

**Interfaces:**
- Produces:
  - `function hashPin(pin: string, salt: string): string`
  - `function verifyPin(pin: string, salt: string, hash: string): boolean`
  - `function isLockedOut(attempts: { at: number }[], now: number): boolean` — 최근 10분 내 5회 이상이면 true.

- [ ] **Step 1: 실패 테스트 작성**

```ts
import { describe, it, expect } from "vitest";
import { hashPin, verifyPin, isLockedOut } from "@/lib/auth/pin";

describe("pin", () => {
  it("verifies a correct pin and rejects a wrong one", () => {
    const salt = "rater-P2-salt";
    const h = hashPin("482913", salt);
    expect(verifyPin("482913", salt, h)).toBe(true);
    expect(verifyPin("000000", salt, h)).toBe(false);
  });
  it("locks out after 5 attempts within 10 minutes", () => {
    const now = 10_000_000;
    const recent = Array.from({ length: 5 }, (_, i) => ({ at: now - i * 60_000 }));
    expect(isLockedOut(recent, now)).toBe(true);
    const old = Array.from({ length: 5 }, (_, i) => ({ at: now - (11 * 60_000) - i }));
    expect(isLockedOut(old, now)).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run lib/auth/pin.test.ts`
Expected: FAIL.

- [ ] **Step 3: 최소 구현**

`lib/auth/pin.ts`:
```ts
import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";

const WINDOW_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;

export function hashPin(pin: string, salt: string): string {
  return bytesToHex(hmac(sha256, utf8ToBytes(salt), utf8ToBytes(pin)));
}

export function verifyPin(pin: string, salt: string, hash: string): boolean {
  return hashPin(pin, salt) === hash;
}

export function isLockedOut(attempts: { at: number }[], now: number): boolean {
  const recent = attempts.filter((a) => now - a.at < WINDOW_MS);
  return recent.length >= MAX_ATTEMPTS;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run lib/auth/pin.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/auth/pin.ts lib/auth/pin.test.ts
git commit -m "feat(auth): PIN hashing and lockout logic"
```

---

## Task 6: Supabase 스키마 + RLS

**Files:**
- Create: `lib/db/schema.sql`
- Create: `lib/db/client.ts`
- Create: `.env.local.example`

**Interfaces:**
- Consumes: 스펙 §3 테이블 정의, Task 2 `Mode`, Task 3 `Scale`.
- Produces: `getServerClient()`, `getBrowserClient()` from `lib/db/client.ts`.

- [ ] **Step 1: 스키마 SQL 작성**

`lib/db/schema.sql` (핵심 테이블 — 스펙 §3):
```sql
create table raters (
  id text primary key,                 -- 'P1'..'P4'
  name text not null,
  pin_hash text not null,
  pin_salt text not null,
  contact text,
  schedule_seed bigint not null
);

create table cases (
  id int primary key,                  -- 1..30
  video_urls jsonb not null,           -- {ceiling,bed,evaluator}
  phenotype text not null default '두통'
);

create table checklist_items (
  id text primary key,
  section text not null check (section in ('Hx','PEx','Edu')),
  scale text not null check (scale in ('binary','triple')),
  text text not null,
  ord int not null
);

create table sessions (
  rater_id text references raters(id),
  period int not null check (period in (1,2)),
  status text not null default 'locked' check (status in ('locked','active','done')),
  window_open_at timestamptz,
  window_close_at timestamptz,
  primary key (rater_id, period)
);

create table assignments (
  id bigserial primary key,
  rater_id text references raters(id),
  case_id int references cases(id),
  period int not null check (period in (1,2)),
  mode text not null check (mode in ('A','B')),
  order_index int not null,
  unique (rater_id, case_id, period)
);

create table case_progress (
  assignment_id bigint primary key references assignments(id),
  state text not null default 'not_started'
    check (state in ('not_started','in_progress','submitted','locked')),
  active_ms bigint not null default 0,
  enter_at timestamptz,
  submit_at timestamptz
);

create table answers (
  assignment_id bigint references assignments(id),
  item_id text references checklist_items(id),
  value int not null,
  decided_at timestamptz not null default now(),
  revised_count int not null default 0,
  primary key (assignment_id, item_id)
);
```

- [ ] **Step 2: RLS 정책 추가**

`lib/db/schema.sql`에 이어서:
```sql
alter table answers enable row level security;
alter table case_progress enable row level security;
-- 서버 route handler는 service_role 키로 접근(RLS 우회)하며 토큰으로 rater를 검증.
-- 브라우저 anon 키에는 직접 테이블 접근 정책을 부여하지 않는다(모든 접근은 /api 경유).
create policy "no direct anon access" on answers for all to anon using (false);
create policy "no direct anon access" on case_progress for all to anon using (false);
```

- [ ] **Step 3: 클라이언트 팩토리 작성**

`lib/db/client.ts`:
```ts
import { createClient } from "@supabase/supabase-js";

export function getServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, // 서버 전용
    { auth: { persistSession: false } }
  );
}
```

`.env.local.example`:
```
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SESSION_TOKEN_SECRET=
```

- [ ] **Step 4: 스키마 적용 검증**

Supabase 프로젝트(서울 리전) 생성 후:
Run: `psql "$SUPABASE_DB_URL" -f lib/db/schema.sql`
Expected: 에러 없이 7개 테이블 생성. (로컬 검증만 하려면 `supabase start` 후 동일 파일 적용.)

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.sql lib/db/client.ts .env.local.example
git commit -m "feat(db): Supabase schema and RLS for study tables"
```

---

## Task 7: 세션 진입 API (토큰+PIN → 세션 컨텍스트)

**Files:**
- Create: `app/api/session/route.ts`

**Interfaces:**
- Consumes: Task 4 `verifyToken`, Task 5 `verifyPin`/`isLockedOut`, Task 6 `getServerClient`.
- Produces: `POST /api/session` body `{ token, pin }` → 성공 시 httpOnly 쿠키(`sid`)에 서명 세션 컨텍스트 세팅 + `{ raterId, period, sessionStatus }`. 실패 시 401/423.

- [ ] **Step 1: 라우트 구현**

`app/api/session/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth/token";
import { verifyPin, isLockedOut } from "@/lib/auth/pin";
import { getServerClient } from "@/lib/db/client";

export async function POST(req: NextRequest) {
  const { token, pin } = await req.json();
  const claim = verifyToken(token ?? "", process.env.SESSION_TOKEN_SECRET!);
  if (!claim) return NextResponse.json({ error: "invalid_token" }, { status: 401 });

  const db = getServerClient();
  const { data: rater } = await db.from("raters").select("*").eq("id", claim.raterId).single();
  if (!rater) return NextResponse.json({ error: "unknown_rater" }, { status: 401 });

  // 시도 제한: pin_attempts 테이블 대신 간단히 최근 시도를 events로 조회(간소화: 여기선 통과 로직만)
  if (!verifyPin(pin ?? "", rater.pin_salt, rater.pin_hash)) {
    return NextResponse.json({ error: "bad_pin" }, { status: 401 });
  }

  const { data: session } = await db
    .from("sessions").select("status")
    .eq("rater_id", claim.raterId).eq("period", claim.period).single();
  if (!session || session.status !== "active") {
    return NextResponse.json({ error: "session_not_active" }, { status: 423 });
  }

  const res = NextResponse.json({ raterId: claim.raterId, period: claim.period, sessionStatus: session.status });
  res.cookies.set("sid", token, { httpOnly: true, sameSite: "lax", secure: true, path: "/" });
  return res;
}
```
> 주: 시도 제한(`isLockedOut`)의 영속 저장은 Plan 2(이벤트)에서 `events` 기반으로 강화. 본 태스크는 인증 흐름과 세션 활성 게이팅에 집중.

- [ ] **Step 2: 수동 통합 확인**

Run(개발 서버 + 시드 데이터 후):
```bash
curl -sX POST localhost:3000/api/session -H 'content-type: application/json' \
  -d '{"token":"<valid>","pin":"<correct>"}' -i | grep -E 'HTTP|set-cookie'
```
Expected: `HTTP/1.1 200` + `set-cookie: sid=...`. 잘못된 PIN → 401. locked 세션 → 423.

- [ ] **Step 3: Commit**

```bash
git add app/api/session/route.ts
git commit -m "feat(api): session entry with token+PIN and active-session gating"
```

---

## Task 8: 케이스 로드/제출 API (enter → submit=잠금)

**Files:**
- Create: `app/api/case/[assignmentId]/route.ts`
- Create: `app/api/case/[assignmentId]/submit/route.ts`

**Interfaces:**
- Consumes: `getServerClient`, 쿠키 `sid`→`verifyToken`, Task 3 `isValidAnswer`.
- Produces:
  - `GET /api/case/:id` → `{ assignment, case, items, answers, state }`; `case_progress.state`를 `in_progress`로, `enter_at` 세팅, `case_enter` 표시.
  - `POST /api/case/:id/submit` body `{ answers: {itemId,value}[] }` → 척도 검증 통과 시 `answers` upsert + `case_progress.state='submitted'`(잠금). 이미 submitted면 409.

- [ ] **Step 1: GET(enter) 구현**

`app/api/case/[assignmentId]/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth/token";
import { getServerClient } from "@/lib/db/client";

async function auth(req: NextRequest) {
  const token = req.cookies.get("sid")?.value ?? "";
  return verifyToken(token, process.env.SESSION_TOKEN_SECRET!);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ assignmentId: string }> }) {
  const claim = await auth(req);
  if (!claim) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { assignmentId } = await params;
  const db = getServerClient();

  const { data: a } = await db.from("assignments").select("*").eq("id", assignmentId).single();
  if (!a || a.rater_id !== claim.raterId || a.period !== claim.period)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { data: c } = await db.from("cases").select("*").eq("id", a.case_id).single();
  const { data: items } = await db.from("checklist_items").select("*").order("ord");
  const { data: answers } = await db.from("answers").select("*").eq("assignment_id", a.id);

  await db.from("case_progress").upsert({
    assignment_id: a.id, state: "in_progress", enter_at: new Date().toISOString(),
  }, { onConflict: "assignment_id", ignoreDuplicates: false });

  // Mode A면 evidence를 절대 실지 않는다(런타임에서 case_content 미로드).
  return NextResponse.json({ assignment: a, case: c, items, answers, mode: a.mode });
}
```

- [ ] **Step 2: POST(submit) 구현 — 척도 검증 + 잠금**

`app/api/case/[assignmentId]/submit/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth/token";
import { getServerClient } from "@/lib/db/client";
import { isValidAnswer, type Scale } from "@/lib/study/scale";

export async function POST(req: NextRequest, { params }: { params: Promise<{ assignmentId: string }> }) {
  const token = req.cookies.get("sid")?.value ?? "";
  const claim = verifyToken(token, process.env.SESSION_TOKEN_SECRET!);
  if (!claim) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { assignmentId } = await params;
  const { answers } = await req.json();
  const db = getServerClient();

  const { data: a } = await db.from("assignments").select("*").eq("id", assignmentId).single();
  if (!a || a.rater_id !== claim.raterId) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { data: prog } = await db.from("case_progress").select("state").eq("assignment_id", a.id).single();
  if (prog?.state === "submitted" || prog?.state === "locked")
    return NextResponse.json({ error: "already_submitted" }, { status: 409 });

  const { data: items } = await db.from("checklist_items").select("id,scale");
  const scaleOf = new Map<string, Scale>((items ?? []).map((i) => [i.id, i.scale as Scale]));
  for (const { itemId, value } of answers) {
    const scale = scaleOf.get(itemId);
    if (!scale || !isValidAnswer(scale, value))
      return NextResponse.json({ error: "invalid_answer", itemId }, { status: 400 });
  }

  await db.from("answers").upsert(
    answers.map((x: { itemId: string; value: number }) => ({
      assignment_id: a.id, item_id: x.itemId, value: x.value, decided_at: new Date().toISOString(),
    }))
  );
  await db.from("case_progress").update({
    state: "submitted", submit_at: new Date().toISOString(),
  }).eq("assignment_id", a.id);

  return NextResponse.json({ ok: true, state: "submitted" });
}
```

- [ ] **Step 3: 수동 통합 확인**

Run: 유효 세션 쿠키로 `GET /api/case/<id>` → 200 + `mode`; 잘못된 값 submit → 400; 정상 submit → 200; 재제출 → 409.

- [ ] **Step 4: Commit**

```bash
git add "app/api/case"
git commit -m "feat(api): case enter and submit-with-lock, scale-validated answers"
```

---

## Task 9: 진입 페이지 + Mode 구동 케이스 러너 (런타임 배선)

**Files:**
- Create: `app/g/[token]/page.tsx`
- Create: `app/g/[token]/CaseRunner.tsx`
- Modify: `app/components/AceApp.tsx` (Mode·척도 props화)
- Modify: `app/components/EvaluationPanel.tsx` (Mode A에서 AI/timestamp 숨김, 척도별 입력)

**Interfaces:**
- Consumes: `/api/session`, `/api/case/:id`, `/api/case/:id/submit`, `assignment.mode`, 척도.
- Produces: 평가자 채점 플로우(한 케이스씩). Mode A: 빈 체크리스트. Mode B: evidence+timestamp(−10초).

- [ ] **Step 1: 진입 페이지(PIN·신원확인)**

`app/g/[token]/page.tsx` — 클라이언트 컴포넌트로 토큰을 받아 PIN 입력폼 표시 → `POST /api/session`. 성공 시 신원확인("P2 · 신OO 교수님 맞으신가요?") 후 `CaseRunner` 렌더. 실패 코드별 안내(401 bad_pin, 423 not_active).

- [ ] **Step 2: CaseRunner — 스케줄 순서대로 케이스 서빙**

`app/g/[token]/CaseRunner.tsx` — `GET`으로 다음 미완 케이스 로드 → `AceApp`에 `mode`·`items`·`answers` 전달 → 제출 시 `POST submit`(잠금) → 다음 케이스. 진행 X/30 표시.

- [ ] **Step 3: AceApp을 props 구동으로 리팩터**

`app/components/AceApp.tsx`: 하드코딩 fetch(`/checklist.json`,`/api/transcript`,`/api/evaluate`) 제거. `props: { mode: "A"|"B"; items; answers; caseContent? }`. **Mode A일 때 `caseContent`(evidence) 미전달 → AI 행·timestamp 버튼 미렌더.** `handleAnswer`는 척도별 `AnswerValue` 사용. 배속 UI 제거(1.0 고정).

- [ ] **Step 4: EvaluationPanel 척도 입력 + Mode 가드**

`app/components/EvaluationPanel.tsx`/`ChecklistQuestion.tsx`: `scale==='binary'`→Yes/No 토글, `scale==='triple'`→우수/보통/미흡. `mode==='A'`면 evidence/timestamp 블록 렌더 안 함. timestamp 점프는 `onTimestampClick(Math.max(0, t-10))`.

- [ ] **Step 5: 스모크 E2E (수동)**

Run: `npm run dev` → 시드된 유효 토큰으로 `/g/<token>` 접속 → PIN → Mode B 케이스에서 evidence+timestamp 보임, 점프 −10초 확인 → 제출 → 다음 케이스. Mode A 케이스에서 evidence/timestamp 안 보임. verdict는 어디에도 안 보임.

- [ ] **Step 6: Commit**

```bash
git add "app/g" app/components/AceApp.tsx app/components/EvaluationPanel.tsx app/components/ChecklistQuestion.tsx lib/types.ts
git commit -m "feat(runtime): token entry, mode-driven case runner, scale inputs"
```

---

## Self-Review (플랜 작성자 체크 결과)

- **스펙 커버리지:** §1 결정(저장소/인증/잠금/척도) → Task 1·3·4·5·6·7·8. §4 인증 → Task 4·5·7. §5 스케줄 → Task 2. §8 런타임(Mode·척도·timestamp·배속) → Task 3·9. §3 데이터모델(런타임 관련 7테이블) → Task 6. **이벤트/진행 대시보드/wash-out/백오피스/전사문은 본 Plan 범위 밖** → Plan 2–4에서 커버(의도된 분해).
- **플레이스홀더:** Task 7의 시도제한 영속화를 Plan 2로 명시 이월(스텁 아님, 인증흐름은 완결). Task 9는 UI 배선이라 코드 대신 파일·동작 명세 — 순수로직 TDD 태스크(2–5)가 검증 핵심.
- **타입 일관성:** `Mode`(Task 2)·`Scale`/`AnswerValue`(Task 3)·`verifyToken`(Task 4)·`isValidAnswer`(Task 3·8)·`getServerClient`(Task 6·7·8) 이름 일치 확인.

---

## Execution Handoff

Plan 1은 기반+런타임. Plan 2(이벤트+진행), Plan 3(백오피스), Plan 4(전사문 파이프라인)는 별도 문서로 이어 작성.
