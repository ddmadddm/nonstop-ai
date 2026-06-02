# 05. AI 파이프라인

OpenAI API로 ① 상담유형 자동분류 ② 임베딩 ③ RAG 기반 답변 초안 생성을 처리한다.

## 모델 선택(제안)

| 용도 | 모델 | 이유 |
|------|------|------|
| 유형 분류 | gpt-4o-mini (structured output) | 저비용·빠름·분류 충분 |
| 임베딩 | text-embedding-3-small (1536차원) | 비용 대비 검색 품질 양호 |
| 답변 생성 | gpt-4o-mini → 필요 시 상위 모델 | 초안 품질·비용 균형 |

> 차원(1536)을 스키마와 일치시킬 것. 모델 변경 시 임베딩 재생성 필요.

## ① 상담유형 자동분류

신규 고객 메시지 수신 후, **DB의 활성 카테고리 목록**을 모델에 제시하고 하나를 고르게 한다(structured output으로 환각 방지).

```ts
// lib/ai/classify.ts
const categories = await getActiveCategories(); // [{id, name, description}]
const completion = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [
    { role: 'system', content: '너는 논스톱서비스 상담 분류기다. 아래 유형 중 가장 적합한 하나를 고른다.' },
    { role: 'user', content: `유형목록:\n${formatCategories(categories)}\n\n상담내용:\n${text}` },
  ],
  response_format: {
    type: 'json_schema',
    json_schema: {
      name: 'classification',
      schema: {
        type: 'object',
        properties: {
          category_id: { type: 'string', enum: categories.map(c => c.id) },
          confidence: { type: 'number' },
        },
        required: ['category_id', 'confidence'],
        additionalProperties: false,
      },
    },
  },
});
```

- `enum`으로 실제 존재하는 ID만 선택 가능 → 잘못된 분류 방지.
- confidence 낮으면(`< 0.5`) 분류 보류(미분류)로 두고 상담원이 지정.

## ② 임베딩

저장 시점에 임베딩 생성:
- **메시지**: 고객 메시지 저장 시 → `messages.embedding` (검색·RAG용)
- **FAQ**: 등록/수정 시 → `faqs.embedding` (`question + answer` 합쳐 임베딩)

```ts
// lib/ai/embed.ts
export async function embed(text: string): Promise<number[]> {
  const r = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return r.data[0].embedding;
}
```

## ③ AI 답변 초안 생성 (RAG)

```
고객 메시지
  → 임베딩
  → match_faqs(임베딩, 5)        # 관련 FAQ Top-5
  → 유사 과거상담 검색(선택)       # match_messages
  → 프롬프트 조립(FAQ + 대화맥락)
  → gpt-4o-mini 생성
  → ai_responses(draft) 저장
```

```ts
// lib/ai/draft.ts
const qEmb = await embed(customerText);
const faqs = await matchFaqs(qEmb, 5);            // RPC: match_faqs
const history = await getRecentMessages(conversationId, 10);

const system = `너는 논스톱서비스 1차 상담원이다.
- 아래 FAQ에 근거해서만 답한다. 근거가 없으면 "확인 후 안내드리겠습니다"라고 한다.
- 정중하고 간결한 한국어 존댓말. 추측/약속 금지.`;

const context = faqs.map((f, i) => `[FAQ${i+1}] Q:${f.question}\nA:${f.answer}`).join('\n\n');

const completion = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [
    { role: 'system', content: system },
    { role: 'user', content: `참고자료:\n${context}\n\n대화맥락:\n${formatHistory(history)}\n\n고객질문:\n${customerText}` },
  ],
});

await saveDraft({
  conversationId,
  triggerMessageId,
  model: 'gpt-4o-mini',
  generatedAnswer: completion.choices[0].message.content,
  usedFaqIds: faqs.map(f => f.id),
});
```

### 환각 방지 원칙
- "FAQ 근거 없으면 단정하지 말 것"을 시스템 프롬프트에 명시.
- 사용한 FAQ를 `used_faq_ids`에 기록 → UI에서 "참고 FAQ" 노출(상담원이 근거 확인 가능).
- **자동 발송 금지**: 항상 상담원 검토 후 발송.

## ④ 검색 (상담이력) — 하이브리드

```
질의어
 ├─ 키워드: messages.content ILIKE / pg_trgm 유사도
 └─ 의미:  embed(질의) → match_messages(임베딩)
       → 두 결과 병합·중복제거·점수 정렬
```

- MVP: 키워드(pg_trgm)만으로 시작 가능. 데이터 쌓이면 의미 검색 추가.

## ⑤ 학습 루프(데이터 축적)
- 상담원의 채택/수정/폐기(`ai_responses.status`, `edited_answer`)를 모아
  - 자주 수정되는 패턴 분석 → FAQ 보강
  - 향후 파인튜닝/프롬프트 개선 근거로 활용.

## 비용·운영 메모
- 임베딩/생성 호출은 후속(비동기) 처리로 웹훅 응답 지연 방지.
- 분류·생성 실패 시 재시도(지수 백오프), 실패해도 상담 저장은 유지.
- OpenAI 호출량 모니터링(일/월 한도 알림).

> 다음: [06. 개발 로드맵](06-roadmap.md)
