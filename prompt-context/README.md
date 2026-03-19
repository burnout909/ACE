# Prompt Engineering Context (Ace)

## 목적
- 이 문서는 `evaluateChecklist` 프롬프트를 고도화하기 위한 컨텍스트와 수정 위치를 정리합니다.

## 관련 파일
- 프롬프트 정의: `lib/openai.ts`
- 호출 라우트: `app/route/evaluate/route.ts`
- 샘플 출력(옵션): `prompt-context/ai-evaluation.json`

## 동작 흐름
1) 클라이언트가 `app/route/evaluate/route.ts`의 POST를 호출합니다.
2) `evaluateChecklist`를 호출해 OpenAI `chat/completions`로 평가를 생성합니다.
3) 결과를 `public/ai/ai-evaluation.json`에 저장합니다.

## 프롬프트 수정 위치
`lib/openai.ts`의 `evaluateChecklist` 함수 내 `messages` 배열
- `role: "system"`: 전반 규칙/원칙/출력 제약
- `role: "user"`: 작업 지시/출력 형식/입력 데이터 전달

## 입력 데이터 구조
`evaluateChecklist`로 전달되는 값은 아래 형태입니다.
- `questions`: 체크리스트 질문 배열
  - `id`, `title`, `criteria`
- `transcript`: 발화 요약 배열
  - `timestamp` (mm:ss), `text`

## 출력 포맷(필수)
JSON 배열만 반환하며 각 항목은 다음과 같습니다.
```json
[
  {
    "questionId": "q-001",
    "aiAnswer": "Yes|No",
    "evidence": ["mm:ss", "mm:ss"]
  }
]
```

## 현재 판정 기준
- evidence가 **명시적으로** 있으면 Yes
- evidence가 없거나 모호/추론/암시면 No
- 억지로 증거를 만들지 않고 객관성 유지
- 답변 텍스트는 한국어(전문용어는 영어 허용)

## 주의 사항
- 출력은 반드시 JSON만 허용(추가 텍스트/마크다운 금지)
- 모델은 `gpt-5`로 지정됨
