# ACE 앱 3-View 동기 플레이어 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ACE 앱을 단일 영상 재생에서, `encounters.json`을 읽어 진료를 선택하고 3개 앵글(ceiling/bedside/evaluator)을 마스터클럭으로 lockstep 동기 재생하는 3뷰 플레이어로 확장한다.

**Architecture:** 동기화 결정 로직을 순수 함수(`lib/sync.ts`)로 추출해 vitest로 단위 테스트한다. React 훅(`useSyncedVideos`)이 3개 `<video>` ref를 받아 마스터/슬레이브 이벤트 전파 + 드리프트 보정을 수행한다. `ViewGrid`는 기존 "큰 화면 1 + 썸네일 2" 레이아웃을 유지하되 3개 실제 영상으로 채운다. 진료 선택 드롭다운이 하드코딩 `video1.mp4`를 대체한다.

**Tech Stack:** Next.js 15 / React 19 / TypeScript / Tailwind, vitest(+ 신규 devDep) for pure-logic tests.

## Global Constraints

- 파이프라인 산출물이 선행: `s3://ace-cpx-videos-2/processed/두통/encounters.json` + `processed/두통/<날짜>/<trim>/<view>.mp4` (public-read + CORS GET).
- 영상 URL 규칙: `https://<NEXT_PUBLIC_S3_BUCKET_NAME>.s3.<NEXT_PUBLIC_S3_REGION>.amazonaws.com/<key>` (기존 `VideoPanel` 패턴 재사용). env: `NEXT_PUBLIC_S3_BUCKET_NAME=ace-cpx-videos-2`, `NEXT_PUBLIC_S3_REGION=ap-northeast-2`.
- 뷰 순서/라벨: ceiling=천장, bedside=침상, evaluator=평가자.
- 드리프트 임계: 슬레이브가 마스터와 `> 0.15s` 벌어지면 `currentTime` 보정.
- 범위 밖: transcript/checklist/AI평가의 진료별 생성(기존 샘플 데이터 유지). 파일 정렬은 파이프라인이 이미 완료(앱은 셋 다 t0부터 재생).
- 기존 파일 컨벤션(2-space 들여쓰기, named exports, `@/lib/*` alias) 준수. DRY / YAGNI / TDD(순수로직) / 잦은 커밋.

## File Structure

- `lib/types.ts` — (수정) `EncounterView`, `Encounter`, `EncountersManifest` 타입 추가
- `lib/sync.ts` — (신규) 순수 동기화 결정 함수(드리프트 보정 판단, 리드 뷰 선정)
- `lib/encounters.ts` — (신규) manifest fetch + view URL 조립
- `app/components/hooks/useSyncedVideos.ts` — (신규) 3 video ref 마스터클럭 동기 훅
- `app/components/MultiViewPanel.tsx` — (신규) 3 `<video>` 렌더(큰 화면 1 + 썸네일 2)
- `app/components/EncounterSelect.tsx` — (신규) 진료 선택 드롭다운
- `app/components/ViewGrid.tsx` — (수정) 3뷰 실제 영상 연결(view4 제거)
- `app/components/AceApp.tsx` — (수정) 진료 상태 + 마스터 ref 승격 + EncounterSelect 배치
- `vitest.config.ts`, `package.json` — (수정) vitest devDep + `test` 스크립트
- `lib/sync.test.ts` — (신규) 순수 로직 테스트

---

## Task 1: vitest 셋업 + 동기화 순수 로직

**Files:**
- Create: `vitest.config.ts`, `lib/sync.ts`, `lib/sync.test.ts`
- Modify: `package.json` (devDependencies + scripts.test)

**Interfaces:**
- Produces:
  - `needsCorrection(masterTime: number, slaveTime: number, threshold?: number): boolean` (기본 threshold 0.15).
  - `clampSeek(time: number, duration: number): number`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/sync.test.ts
import { describe, it, expect } from "vitest";
import { needsCorrection, clampSeek } from "./sync";

describe("needsCorrection", () => {
  it("false when within threshold", () => {
    expect(needsCorrection(10.0, 10.1)).toBe(false);
  });
  it("true when drift exceeds threshold", () => {
    expect(needsCorrection(10.0, 10.3)).toBe(true);
    expect(needsCorrection(10.0, 9.7)).toBe(true);
  });
  it("respects custom threshold", () => {
    expect(needsCorrection(10.0, 10.4, 0.5)).toBe(false);
  });
});

describe("clampSeek", () => {
  it("clamps into [0, duration]", () => {
    expect(clampSeek(-5, 100)).toBe(0);
    expect(clampSeek(120, 100)).toBe(100);
    expect(clampSeek(42, 100)).toBe(42);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --run lib/sync.test.ts`
Expected: FAIL (vitest not installed / `lib/sync` not found)

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/sync.ts
export function needsCorrection(
  masterTime: number,
  slaveTime: number,
  threshold = 0.15
): boolean {
  return Math.abs(masterTime - slaveTime) > threshold;
}

export function clampSeek(time: number, duration: number): number {
  if (time < 0) return 0;
  if (time > duration) return duration;
  return time;
}
```
```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { environment: "node", include: ["lib/**/*.test.ts"] },
});
```
Modify `package.json`: add to `devDependencies` `"vitest": "^2.1.0"`, and to `scripts` `"test": "vitest"`. Then `npm install`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm install && npm run test -- --run lib/sync.test.ts`
Expected: PASS (5 passed)

- [ ] **Step 5: Commit**

```bash
git add lib/sync.ts lib/sync.test.ts vitest.config.ts package.json package-lock.json
git commit -m "feat(app): vitest setup + pure sync helpers"
```

---

## Task 2: 타입 + encounters manifest 로더

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/encounters.ts`, `lib/encounters.test.ts`

**Interfaces:**
- Consumes: env `NEXT_PUBLIC_S3_BUCKET_NAME`, `NEXT_PUBLIC_S3_REGION`.
- Produces:
  - types `EncounterView {key:string; offsetAppliedSec:number}`, `Encounter {id;dateFolder;trim;durationSec;views:Record<"ceiling"|"bedside"|"evaluator",EncounterView|undefined>;missingViews:string[]}`, `EncountersManifest {complaint:string;encounters:Encounter[]}`.
  - `s3Url(key: string): string`.
  - `viewSrc(enc: Encounter, view: string): string | null`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/encounters.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { s3Url, viewSrc } from "./encounters";
import type { Encounter } from "./types";

beforeAll(() => {
  process.env.NEXT_PUBLIC_S3_BUCKET_NAME = "ace-cpx-videos-2";
  process.env.NEXT_PUBLIC_S3_REGION = "ap-northeast-2";
});

const enc: Encounter = {
  id: "251111_tue__trim1", dateFolder: "251111_tue", trim: "1", durationSec: 658,
  views: {
    ceiling: { key: "processed/두통/251111_tue/1/ceiling.mp4", offsetAppliedSec: 0 },
    bedside: { key: "processed/두통/251111_tue/1/bedside.mp4", offsetAppliedSec: 13 },
    evaluator: undefined,
  },
  missingViews: ["evaluator"],
};

it("s3Url builds bucket url", () => {
  expect(s3Url("a/b.mp4")).toBe(
    "https://ace-cpx-videos-2.s3.ap-northeast-2.amazonaws.com/a/b.mp4"
  );
});

it("viewSrc returns url or null for missing view", () => {
  expect(viewSrc(enc, "ceiling")).toContain("/ceiling.mp4");
  expect(viewSrc(enc, "evaluator")).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --run lib/encounters.test.ts`
Expected: FAIL (`lib/encounters` not found)

- [ ] **Step 3: Write minimal implementation**

Add to `lib/types.ts`:
```ts
export type ViewId = "ceiling" | "bedside" | "evaluator";

export type EncounterView = {
  key: string;
  offsetAppliedSec: number;
};

export type Encounter = {
  id: string;
  dateFolder: string;
  trim: string;
  durationSec: number;
  views: Record<ViewId, EncounterView | undefined>;
  missingViews: string[];
};

export type EncountersManifest = {
  complaint: string;
  encounters: Encounter[];
};
```
```ts
// lib/encounters.ts
import type { Encounter, EncountersManifest, ViewId } from "@/lib/types";

export function s3Url(key: string): string {
  const bucket = process.env.NEXT_PUBLIC_S3_BUCKET_NAME;
  const region = process.env.NEXT_PUBLIC_S3_REGION;
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

export function viewSrc(enc: Encounter, view: string): string | null {
  const v = enc.views[view as ViewId];
  return v ? s3Url(v.key) : null;
}

export async function fetchEncounters(): Promise<EncountersManifest> {
  const res = await fetch(s3Url("processed/두통/encounters.json"), { cache: "no-store" });
  return (await res.json()) as EncountersManifest;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- --run lib/encounters.test.ts`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts lib/encounters.ts lib/encounters.test.ts
git commit -m "feat(app): encounter types and manifest loader"
```

---

## Task 3: useSyncedVideos 훅 (마스터클럭 동기)

**Files:**
- Create: `app/components/hooks/useSyncedVideos.ts`

**Interfaces:**
- Consumes: `needsCorrection` from `@/lib/sync`.
- Produces: `useSyncedVideos(masterView: ViewId, refs: Record<ViewId, RefObject<HTMLVideoElement>>): void`. 마스터의 play/pause/seeking/ratechange를 슬레이브에 전파하고 rAF로 드리프트 보정.

- [ ] **Step 1: Write implementation** (React 훅 — DOM 이벤트 기반이라 순수 로직은 Task1에서 테스트됨; 훅은 수동 검증)

```ts
// app/components/hooks/useSyncedVideos.ts
import { useEffect } from "react";
import type { RefObject } from "react";
import type { ViewId } from "@/lib/types";
import { needsCorrection } from "@/lib/sync";

export function useSyncedVideos(
  masterView: ViewId,
  refs: Record<ViewId, RefObject<HTMLVideoElement>>
): void {
  useEffect(() => {
    const master = refs[masterView].current;
    if (!master) return;
    const slaves = (Object.keys(refs) as ViewId[])
      .filter((v) => v !== masterView)
      .map((v) => refs[v].current)
      .filter((el): el is HTMLVideoElement => !!el);

    const syncPlay = () => slaves.forEach((s) => s.play().catch(() => undefined));
    const syncPause = () => slaves.forEach((s) => s.pause());
    const syncSeek = () =>
      slaves.forEach((s) => {
        s.currentTime = master.currentTime;
      });
    const syncRate = () => slaves.forEach((s) => (s.playbackRate = master.playbackRate));

    master.addEventListener("play", syncPlay);
    master.addEventListener("pause", syncPause);
    master.addEventListener("seeked", syncSeek);
    master.addEventListener("ratechange", syncRate);

    let raf = 0;
    const tick = () => {
      slaves.forEach((s) => {
        if (needsCorrection(master.currentTime, s.currentTime)) {
          s.currentTime = master.currentTime;
        }
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // align once on mount
    syncSeek();
    syncRate();
    if (!master.paused) syncPlay();

    return () => {
      master.removeEventListener("play", syncPlay);
      master.removeEventListener("pause", syncPause);
      master.removeEventListener("seeked", syncSeek);
      master.removeEventListener("ratechange", syncRate);
      cancelAnimationFrame(raf);
    };
  }, [masterView, refs]);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in the new file.

- [ ] **Step 3: Commit**

```bash
git add app/components/hooks/useSyncedVideos.ts
git commit -m "feat(app): useSyncedVideos master-clock sync hook"
```

---

## Task 4: MultiViewPanel (3 video 렌더) + ViewGrid 교체

**Files:**
- Create: `app/components/MultiViewPanel.tsx`
- Modify: `app/components/ViewGrid.tsx`

**Interfaces:**
- Consumes: `useSyncedVideos`, `viewSrc`, `Encounter`, `ViewId`.
- Produces: `MultiViewPanel({ encounter, activeView, onActivate, masterRef, onTimeUpdate })`. `masterRef`는 활성 뷰의 video ref(AceApp의 기존 videoRef 승격분).

- [ ] **Step 1: Write implementation**

```tsx
// app/components/MultiViewPanel.tsx
"use client";

import { useMemo, useRef } from "react";
import type { RefObject } from "react";
import type { Encounter, ViewId } from "@/lib/types";
import { viewSrc } from "@/lib/encounters";
import { useSyncedVideos } from "./hooks/useSyncedVideos";

const VIEW_LABELS: Record<ViewId, string> = {
  ceiling: "천장",
  bedside: "침상",
  evaluator: "평가자",
};
const ORDER: ViewId[] = ["ceiling", "bedside", "evaluator"];

type Props = {
  encounter: Encounter;
  activeView: ViewId;
  onActivate: (v: ViewId) => void;
  masterRef: RefObject<HTMLVideoElement>;
  onTimeUpdate: (t: number) => void;
};

export default function MultiViewPanel({
  encounter,
  activeView,
  onActivate,
  masterRef,
  onTimeUpdate,
}: Props) {
  const bedsideRef = useRef<HTMLVideoElement>(null);
  const evaluatorRef = useRef<HTMLVideoElement>(null);
  const ceilingRef = useRef<HTMLVideoElement>(null);

  // active view uses the shared masterRef; the others use local refs
  const refs = useMemo(() => {
    const local: Record<ViewId, RefObject<HTMLVideoElement>> = {
      ceiling: ceilingRef,
      bedside: bedsideRef,
      evaluator: evaluatorRef,
    };
    local[activeView] = masterRef;
    return local;
  }, [activeView, masterRef]);

  useSyncedVideos(activeView, refs);

  const thumbs = ORDER.filter((v) => v !== activeView);

  const renderVideo = (view: ViewId, isMaster: boolean) => {
    const src = viewSrc(encounter, view);
    if (!src) {
      return (
        <div className="flex h-full items-center justify-center rounded-xl bg-slate-800 text-xs text-slate-300">
          {VIEW_LABELS[view]} 없음
        </div>
      );
    }
    return (
      <video
        ref={refs[view]}
        src={src}
        className="h-full w-full rounded-xl bg-slate-950 object-cover"
        controls={isMaster}
        muted={!isMaster}
        playsInline
        preload="metadata"
        onTimeUpdate={
          isMaster ? (e) => onTimeUpdate(e.currentTarget.currentTime) : undefined
        }
      />
    );
  };

  return (
    <div className="grid h-full grid-cols-[1fr_260px] gap-3">
      <div className="relative overflow-hidden rounded-2xl border border-yonsei-200 p-1">
        <div className="absolute left-4 top-4 z-10 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 shadow">
          {VIEW_LABELS[activeView]}
        </div>
        {renderVideo(activeView, true)}
      </div>
      <div className="flex flex-col gap-3">
        {thumbs.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onActivate(v)}
            className="relative flex-1 overflow-hidden rounded-2xl border border-slate-200 p-1 hover:border-slate-300"
          >
            <div className="absolute left-3 top-3 z-10 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500 shadow">
              {VIEW_LABELS[v]}
            </div>
            {renderVideo(v, false)}
          </button>
        ))}
      </div>
    </div>
  );
}
```
Modify `ViewGrid.tsx`: replace its body to delegate to `MultiViewPanel` when an `encounter` prop is present. Update `ViewGridProps` to add `encounter: Encounter | null` and change `activeView`/`onActivate` to `ViewId`. Remove the `view4` entry and `PlaceholderPanel`/`VideoPanel` usage. New `ViewGrid.tsx`:
```tsx
// app/components/ViewGrid.tsx
import type { RefObject } from "react";
import type { Encounter, ViewId } from "@/lib/types";
import MultiViewPanel from "./MultiViewPanel";

type ViewGridProps = {
  encounter: Encounter | null;
  activeView: ViewId;
  onActivate: (viewId: ViewId) => void;
  masterRef: RefObject<HTMLVideoElement>;
  onTimeUpdate: (time: number) => void;
};

export default function ViewGrid({
  encounter,
  activeView,
  onActivate,
  masterRef,
  onTimeUpdate,
}: ViewGridProps) {
  if (!encounter) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-slate-200 bg-white/60 text-sm text-slate-400">
        진료를 선택하세요
      </div>
    );
  }
  return (
    <MultiViewPanel
      encounter={encounter}
      activeView={activeView}
      onActivate={onActivate}
      masterRef={masterRef}
      onTimeUpdate={onTimeUpdate}
    />
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors only in `AceApp.tsx` (ViewGrid props changed) — fixed in Task 6.

- [ ] **Step 3: Commit**

```bash
git add app/components/MultiViewPanel.tsx app/components/ViewGrid.tsx
git commit -m "feat(app): 3-view MultiViewPanel and ViewGrid rewire"
```

---

## Task 5: EncounterSelect 드롭다운

**Files:**
- Create: `app/components/EncounterSelect.tsx`

**Interfaces:**
- Produces: `EncounterSelect({ encounters, value, onChange })` — `<select>`로 진료 id 선택. 라벨은 `날짜 · Trim{n}` (+ 뷰 누락 시 표시).

- [ ] **Step 1: Write implementation**

```tsx
// app/components/EncounterSelect.tsx
"use client";

import type { Encounter } from "@/lib/types";

type Props = {
  encounters: Encounter[];
  value: string | null;
  onChange: (id: string) => void;
};

export default function EncounterSelect({ encounters, value, onChange }: Props) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm"
    >
      <option value="" disabled>
        진료 선택
      </option>
      {encounters.map((e) => (
        <option key={e.id} value={e.id}>
          {e.dateFolder} · Trim{e.trim}
          {e.missingViews.length ? ` (뷰 ${3 - e.missingViews.length}/3)` : ""}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors in this file.

- [ ] **Step 3: Commit**

```bash
git add app/components/EncounterSelect.tsx
git commit -m "feat(app): encounter selector dropdown"
```

---

## Task 6: AceApp 통합 (진료 상태 + 마스터 ref + 셀렉터 배치)

**Files:**
- Modify: `app/components/AceApp.tsx`

**Interfaces:**
- Consumes: `fetchEncounters`, `EncounterSelect`, updated `ViewGrid`, `Encounter`, `ViewId`.

- [ ] **Step 1: Modify AceApp** — 아래 변경을 적용:
  1. import 추가: `import EncounterSelect from "./EncounterSelect";`, `import { fetchEncounters } from "@/lib/encounters";`, 타입 `Encounter, ViewId` 추가.
  2. 상태 추가:
```tsx
const [encounters, setEncounters] = useState<Encounter[]>([]);
const [encounterId, setEncounterId] = useState<string | null>(null);
```
  3. `activeView` 초기값을 `useState<ViewId>("ceiling")` 로 변경.
  4. manifest 로딩 effect 추가:
```tsx
useEffect(() => {
  fetchEncounters()
    .then((m) => {
      setEncounters(m.encounters);
      if (m.encounters[0]) setEncounterId(m.encounters[0].id);
    })
    .catch(() => setEncounters([]));
}, []);
```
  5. 선택 진료 파생:
```tsx
const currentEncounter = useMemo(
  () => encounters.find((e) => e.id === encounterId) ?? null,
  [encounters, encounterId]
);
```
  6. `handleTimestampClick`에서 `setActiveView("view1")` → `setActiveView("ceiling")` 로 수정(마스터=현재 activeView, videoRef가 마스터).
  7. `ViewGrid` 호출부를 새 props로 교체:
```tsx
<ViewGrid
  encounter={currentEncounter}
  activeView={activeView}
  onActivate={setActiveView}
  masterRef={videoRef}
  onTimeUpdate={setCurrentTime}
/>
```
  8. 비디오 패널 상단에 셀렉터 배치(비디오 패널 `div` 상단에 추가):
```tsx
<div className="flex items-center justify-between px-1 pb-2">
  <EncounterSelect encounters={encounters} value={encounterId} onChange={setEncounterId} />
  <span className="text-xs text-slate-400">두통 · 3-view</span>
</div>
```

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: 컴파일/빌드 성공(타입 에러 0).

- [ ] **Step 3: Commit**

```bash
git add app/components/AceApp.tsx
git commit -m "feat(app): wire 3-view player, encounter selection into AceApp"
```

---

## Task 7: 인프라 (S3 public-read + CORS) + 수동 검증

**Files:** 없음(운영 설정) — 문서화는 `pipeline/README.md`에 추가.

- [ ] **Step 1: S3 버킷 CORS 설정** (한 번):
```json
[{ "AllowedOrigins": ["*"], "AllowedMethods": ["GET"], "AllowedHeaders": ["*"], "ExposeHeaders": ["Content-Length","Accept-Ranges"] }]
```
`processed/` 접두어 public-read(버킷 정책 또는 CloudFront). 최소 정책:
```json
{ "Effect":"Allow","Principal":"*","Action":"s3:GetObject","Resource":"arn:aws:s3:::ace-cpx-videos-2/processed/*" }
```
- [ ] **Step 2:** `.env.local`에 `NEXT_PUBLIC_S3_BUCKET_NAME=ace-cpx-videos-2`, `NEXT_PUBLIC_S3_REGION=ap-northeast-2` 확인.
- [ ] **Step 3:** `npm run dev` → 진료 선택 → 3뷰가 뜨고 **동시에 재생/일시정지/seek**이 lockstep인지 확인(썸네일 클릭으로 마스터 스왑 시에도 동기 유지).
- [ ] **Step 4:** transcript 타임스탬프 클릭 → 마스터가 그 시각으로 이동하고 슬레이브도 따라오는지 확인.
- [ ] **Step 5:** 뷰 누락 진료(251216 일부) 선택 시 누락 뷰 자리에 "…없음" 표시 + 나머지 2뷰 정상 재생 확인.

---

## Self-Review (작성자 체크 완료)

- **Spec 커버리지**: 3video 재생(§5.1)=Task4, 마스터클럭 동기+드리프트(§5.2)=Task1+Task3, 뷰 전환(§5.3)=Task4(썸네일→activeView 스왑), 진료 선택(§5.4)=Task5+Task6, 인프라(§5.5)=Task7. 범위 밖(transcript/AI)=유지(§9).
- **타입 일관성**: `ViewId`("ceiling"|"bedside"|"evaluator"), `Encounter.views: Record<ViewId, EncounterView|undefined>`, `needsCorrection`/`viewSrc`/`s3Url` 시그니처가 Task2·3·4에서 일치. `masterRef`=AceApp `videoRef`(HTMLVideoElement) 일관.
- **엣지**: 뷰 누락→`viewSrc` null→"…없음"(Task4/Task7). manifest 로딩 실패→빈 목록+"진료를 선택하세요".
- **의존**: Task6는 Task2·4·5 산출 타입/컴포넌트에 의존. 순수로직만 TDD, UI는 typecheck+build+수동 검증(리포에 테스트 인프라 없음 → vitest는 순수로직에만 도입).
