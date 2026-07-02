# 3-View 동기화 영상 파이프라인 + ACE 앱 플레이어 설계

- 작성일: 2026-07-01
- 상태: 설계 승인 대기 → 구현계획 예정
- 관련 리포: `burnout909/ACE` (이 리포)

## 1. 목표

CPX 두통 진료의 **3개 카메라 앵글**(천장 / 침상 / 평가자 시선) DJI 원본을 받아,
**시작 오프셋을 정렬**하고 **웹 재생용으로 최적화**한 뒤, ACE 앱에서 **3패널 lockstep 동기 재생**한다.

두 컴포넌트로 구성한다(하나의 spec, 분리 구현):

- **컴포넌트 A — 영상 처리 파이프라인** (로컬 Python + ffmpeg)
- **컴포넌트 B — ACE 앱 3뷰 동기 플레이어** (Next.js 앱 수정)

## 2. 용어

- **encounter(진료)**: 한 학생의 한 번의 진료. `(날짜, Trim번호)`로 식별. 세 앵글이 각각 한 파일.
- **view(뷰/앵글)**: `ceiling`(천장), `bedside`(침상), `evaluator`(평가자 시선).
- **offset(오프셋)**: 같은 진료를 찍은 세 파일의 시작 시각 차이(초). 정렬로 제거한다.

## 3. 입력 데이터 (실측 기준)

- 위치: `s3://ace-cpx-videos-2/두통/<view>/<날짜폴더>/<DJI파일>.MP4`
  - 날짜폴더 예: `251111_tue`, 파일 예: `DJI_20251111132039_0039_D - Trim1.mp4`
- 원본 스펙(실측): **H.264 1920×1088(≈1080p), ~28 Mbps, 29.97fps / AAC 48kHz 스테레오 320k / 진료당 ~11.5분**
  - DJI가 붙이는 mjpeg 1280×720 썸네일 스트림이 있으며 무시한다.
- 대상: 두통 5개 날짜(전부 화요일) × 3뷰 = **93개 파일 ≈ 196GB**
  - `250826_tue, 250909_tue, 251111_tue, 251202_tue, 251216_tue`
- 뷰별 파일 수가 불일치하는 날 존재: **251216 = 천장 9 / 침상 9 / 평가자 6**, 일부 `Trim5-1/5-2` 분할.

## 4. 컴포넌트 A — 처리 파이프라인

### 4.1 페어링
- key = `(날짜, 정규화된 Trim id)`. Trim id는 `Trim1`, `Trim5-1` 등에서 추출(`1`, `5-1`).
- 세 뷰를 묶어 encounter 생성.
- **불일치 처리**: 세 뷰가 다 있으면 정상 encounter. 일부 뷰 누락 시 `missingViews`에 기록하고 **리포트로 플래그**(조용히 버리지 않음). 2뷰만 있는 encounter도 산출물로 남기되 표시한다.
- 산출: `pairing_report.json` (매칭 결과 + 불일치 목록).

### 4.2 오디오 교차상관 정렬 (자동 + 수동검수)
- 각 뷰에서 **저비트 모노 오디오만 추출**(ffmpeg이 S3 https 원본을 직접 스트리밍하여 읽음 → 전체 재다운로드 불필요). 예: 16kHz mono wav.
- **천장을 기준(reference)** 으로 침상·평가자의 lag(초)를 **FFT 기반 교차상관**으로 산출.
- **신뢰도 점수** 계산(정규화 상관 피크 값 / 차순위 피크 대비 prominence).
- 산출: `sync_report.json` — encounter별 `{offset_bedside, offset_evaluator, confidence}`.
- **수동검수**: 신뢰도 임계값 미만 encounter만 사람이 확인. 검수용으로 짧은 정렬 프리뷰(예: 정렬 후 3뷰 30초 몽타주) 또는 표 제공. 사람이 `sync_overrides.json`에 오프셋 수정값을 넣으면 파이프라인이 우선 적용.

### 4.3 정렬 + 웹 최적화 (뷰당 ffmpeg 1패스)
- 각 뷰를 **자기 오프셋만큼 앞부분을 잘라** 세 뷰가 공통 t0에서 시작하도록 함(`-ss`).
- 끝은 **세 뷰의 최단 길이**에 맞춰 잘라 길이/프레임 정렬(`-t`).
- 인코딩(확정):
  - 비디오: `libx264`, **1920×1080**(1088→1080 정리), High profile, **CRF 23**, `preset medium`, **`-movflags +faststart`**, 29.97fps 유지
  - 오디오: `aac 128k`, 48kHz 스테레오
  - 매핑: 메인 비디오/오디오만(`-map 0:v:0 -map 0:a:0`), DJI 썸네일 스트림 제거
- 예상 산출: 뷰당 **~250–300MB**, 처리본 총계 ≈ **~27GB**.

### 4.4 출력 + manifest
- S3: `s3://ace-cpx-videos-2/processed/두통/<날짜폴더>/<trim>/{ceiling,bedside,evaluator}.mp4`
- `encounters.json`(앱이 소비):
```json
{
  "complaint": "두통",
  "encoding": { "video": "h264 1920x1080 crf23 faststart", "audio": "aac 128k" },
  "encounters": [
    {
      "id": "251111_tue__trim1",
      "date": "2025-11-11",
      "dateFolder": "251111_tue",
      "trim": "1",
      "durationSec": 679.2,
      "views": {
        "ceiling":   { "key": "processed/두통/251111_tue/1/ceiling.mp4",   "offsetAppliedSec": 0.0 },
        "bedside":   { "key": "processed/두통/251111_tue/1/bedside.mp4",   "offsetAppliedSec": 13.1 },
        "evaluator": { "key": "processed/두통/251111_tue/1/evaluator.mp4", "offsetAppliedSec": 22.7 }
      },
      "sync": { "method": "audio-xcorr", "confidence": 0.86, "reviewed": false },
      "missingViews": []
    }
  ]
}
```

### 4.5 실행 형태
- 로컬 Mac에서 Python 스크립트로 배치 실행. 코드 위치: 리포 내 `pipeline/`.
- ffmpeg이 S3 원본을 https(presigned URL)로 직접 읽어 트랜스코드 → 로컬 임시 → S3 `processed/`로 업로드.
- **재개 가능**: 이미 처리된 encounter는 skip(S3에 산출물 존재 + 크기 확인). **encounter 단위 병렬**.

### 4.6 검증 스파이크 (구현 1단계)
- 대표 진료 1건(예: `251111_tue trim1`)으로 오디오 교차상관 → 오프셋/신뢰도 확인 → 정렬 프리뷰 눈으로 검증.
- 자동 정렬 정확도가 충분한지 확인 후 전체 배치.

## 5. 컴포넌트 B — ACE 앱 3뷰 동기 플레이어

### 5.1 재생 구조
- 현재 `VideoPanel` 단일 `<video>` → **뷰당 `<video>` 3개**(ceiling/bedside/evaluator).
- 파일이 공통 t0로 정렬돼 있으므로 세 영상 모두 `currentTime` 0부터 lockstep.

### 5.2 마스터클럭 동기
- 활성(확대) 뷰 = **마스터**. play/pause/seek/속도변경을 슬레이브 2개에 전파.
- **드리프트 보정**: 주기적으로 `|slave.currentTime − master.currentTime| > 0.15s` 이면 슬레이브 `currentTime` 보정.
- 기존 단일 `videoRef`(transcript 타임스탬프 클릭 → seek 등) → **마스터 ref로 승격**.

### 5.3 뷰 전환
- `ViewGrid`의 기존 "큰 화면 1 + 썸네일 2" 패턴 유지. 썸네일 클릭 시 해당 앵글이 마스터/확대로 스왑, 세 뷰는 계속 동기.
- 미사용 `view4` placeholder 제거(3뷰 고정).

### 5.4 진료 선택
- 하드코딩 `video1.mp4` 제거 → `encounters.json`을 읽어 **진료 드롭다운** 제공.
- 진료 선택 시 해당 encounter의 3뷰 S3 URL을 로드.

### 5.5 인프라
- 브라우저가 S3 영상을 직접 재생 → 버킷 `processed/` 경로 **public-read + CORS(GET)** 설정.
- 기존 앱이 이미 사용하는 env 재활용: `NEXT_PUBLIC_S3_BUCKET_NAME=ace-cpx-videos-2`, `NEXT_PUBLIC_S3_REGION=ap-northeast-2`.

## 6. 데이터 흐름

```
S3 두통/원본(3뷰)
   └─(A) 페어링 → 오디오 xcorr 정렬(+수동검수) → 트림/최적화 인코딩
        └─→ S3 processed/두통/<날짜>/<trim>/{ceiling,bedside,evaluator}.mp4 + encounters.json
              └─(B) ACE 앱: encounters.json 로드 → 3<video> 마스터클럭 동기 재생
```

## 7. 에러 처리 / 엣지 케이스

- **뷰 누락**(251216 평가자 부족): encounter를 2뷰로 산출, `missingViews` 표기. 앱은 누락 뷰 자리에 안내 표시.
- **Trim 분할**(`5-1/5-2`): 각 분할을 독립 encounter로 취급. 뷰마다 분할 방식이 다르면 페어링 리포트에 플래그 → 수동 확인.
- **낮은 정렬 신뢰도**: 수동검수 큐로 이동, `sync_overrides.json`로 교정.
- **네트워크/트랜스코드 실패**: encounter 단위 재시도, 실패는 리포트에 남기고 다음 진행. 재실행 시 미완료분만.
- **오디오 없음/무음 구간**: 교차상관 실패 시 신뢰도 0으로 표기 → 수동검수.

## 8. 테스트 / 검증

- 파이프라인
  - 페어링 로직 단위 테스트(불일치/분할 케이스 포함, 실제 manifest 기반).
  - 교차상관: 알려진 오프셋을 인위로 준 클립으로 검출 정확도 테스트.
  - 검증 스파이크로 실데이터 1건 확인.
- 앱
  - 3뷰 동기 재생/일시정지/seek/뷰 전환 수동 검증(드리프트 임계 내 유지).
  - 진료 선택 시 정확한 3뷰 로드.

## 9. 비목표(Non-goals) / YAGNI

- 신규 진료의 **transcript / checklist / AI 평가 생성**은 범위 밖(별도 CPXMate 파이프라인). 이번엔 동기 영상 재생까지.
- 합성 그리드(1파일) 출력은 하지 않음(앵글별 3파일로 결정).
- 무빙캠/녹음기 등 3뷰 외 소스는 제외.
- CloudFront/서명URL 스트리밍 최적화는 후속(우선 public-read + faststart).

## 10. 미해결/후속 확인

- 두통 외 다른 표현형(좌측마비/저림/수면장애/어지럼)으로 확장 여부(현 설계는 표현형 파라미터화 가능).
- 진료 선택 UI 상세(드롭다운 vs 리스트 사이드바)는 구현 시 확정.
