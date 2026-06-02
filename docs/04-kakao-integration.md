# 04. 카카오 연동 (상담톡 API)

> ⚠️ **사전 확인 필요**: 카카오 상담톡(상담 API)은 **카카오 비즈니스 채널 + 상담톡/상담 API 이용 계약**이 있어야 사용 가능하며, 메시지 수신(웹훅)·발송 스펙은 계약 형태(상담톡 API 직접 연동 vs 솔루션 경유)에 따라 달라진다. 아래는 일반적인 "웹훅 수신 + API 발송" 패턴을 전제로 한 설계이며, **실제 필드명/엔드포인트는 발급받은 카카오 연동 문서로 확정**해야 한다. 이 문서는 그 전까지의 작업 설계 기준이다.

## 연동 형태 두 가지

| 형태 | 설명 | 적합성 |
|------|------|--------|
| 상담톡 API 직접 연동 | 카카오와 상담 API 계약, 웹훅으로 수신·API로 발송 | 본 프로젝트 목표 |
| 솔루션(채널톡/해피톡 등) 경유 | 외부 상담 솔루션의 API/웹훅 사용 | 계약이 어려울 때 대안 |

→ 어느 쪽이든 **"우리 서버가 받는 웹훅 1개 + 보내는 API 1개"** 추상화로 동일하게 설계. `lib/kakao/` 어댑터에서 차이를 흡수.

## 수신 흐름 (웹훅)

```
카카오 → POST /api/kakao/webhook
  1) 시그니처/시크릿 검증
  2) 페이로드 파싱 → { userKey, text, attachments, occurredAt }
  3) customer upsert (kakao_user_key 기준)
  4) conversation 찾기/생성 (열린 상담 재사용)
  5) messages insert (sender_type='customer', raw_payload=원본)
  6) conversations.last_message_at 갱신
  7) 200 즉시 응답 (3~5초 내)
  8) 후속(비동기): 분류 → 임베딩 → AI 초안
```

### 엔드포인트 스켈레톤

```ts
// app/api/kakao/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyKakaoSignature, parseInbound } from '@/lib/kakao';
import { saveInboundMessage } from '@/lib/db/messages';
import { enqueueProcessing } from '@/lib/ai/queue';

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyKakaoSignature(req, raw)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const inbound = parseInbound(JSON.parse(raw)); // { userKey, text, attachments, occurredAt }
  const { conversationId, messageId } = await saveInboundMessage(inbound);

  // 즉시 ack, 후속 처리는 비동기
  enqueueProcessing({ conversationId, messageId });
  return NextResponse.json({ ok: true });
}
```

> 카카오는 보통 웹훅 응답 지연 시 재전송한다 → **저장은 멱등(idempotent)** 하게. 메시지 원본의 고유 ID를 `raw_payload`에 보관하고 중복 수신 시 무시.

## 발송 흐름 (상담원 → 고객)

```
상담원 [발송] → POST /api/kakao/send { conversationId, text }
  1) 권한/대화 확인
  2) 카카오 발송 API 호출 (lib/kakao.sendMessage)
  3) messages insert (sender_type='agent', sender_agent_id)
  4) 실패 시 재시도/에러 표시
```

```ts
// lib/kakao/index.ts (어댑터)
export async function sendMessage(userKey: string, text: string) {
  const res = await fetch(KAKAO_SEND_URL, {
    method: 'POST',
    headers: {
      'Authorization': `KakaoAK ${process.env.KAKAO_REST_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ user_key: userKey, message: { text } }),
  });
  if (!res.ok) throw new Error(`Kakao send failed: ${res.status}`);
  return res.json();
}
```

## 멱등성·매칭 규칙

- **고객 매칭**: `kakao_user_key` UNIQUE upsert.
- **대화 매칭**: 해당 고객의 `status='open'` 대화가 있으면 이어붙이고, 없으면 새로 생성. (장시간 무응답 시 자동 close 정책은 추후.)
- **중복 수신**: 카카오 원본 메시지 ID를 키로 중복 차단.

## 보안

- 웹훅 검증: 카카오가 제공하는 서명/토큰 또는 사전 공유 시크릿(`KAKAO_WEBHOOK_SECRET`).
- 저장은 `service_role` 키(서버 전용)로 RLS 우회.
- 엔드포인트는 POST만 허용, 페이로드 크기 제한.

## 확정해야 할 항목 (카카오 연동 문서 수령 후)

- [ ] 연동 형태(직접 vs 솔루션) 및 발급 키 종류
- [ ] 수신 웹훅 페이로드 스키마(필드명, 사용자 식별키)
- [ ] 발송 API 엔드포인트·요청 형식·메시지 타입(텍스트/이미지/버튼)
- [ ] 웹훅 검증 방식(서명 헤더 유무)
- [ ] 발송 제약(상담 세션 시간창, 템플릿 필요 여부)

> 다음: [05. AI 파이프라인](05-ai-pipeline.md)
