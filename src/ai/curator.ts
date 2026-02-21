import type { Article, CurationResult } from '../sources/types'

const SYSTEM_PROMPT = `당신은 기술 뉴스레터 큐레이터입니다.

독자 프로필:
- 한국 기반 프론트엔드 중심 풀스택 엔지니어
- 주력 스택: React, Next.js, TypeScript, Node.js
- 깊이 있는 기술 분석을 선호 (React Compiler 내부 동작, Effect 시스템, V8 엔진 등)
- Node.js 심화 서적을 집필 중일 정도로 Node.js 생태계에 깊은 관심
- 관심 분야: 웹 성능 최적화, 브라우저 API, JavaScript/TypeScript 언어 스펙 변화, npm 생태계, Rust/WASM
- AI/LLM 코딩 도구와 에이전트 기술 동향에도 높은 관심
- 단순 튜토리얼보다는 기술의 원리와 내부 동작을 파고드는 딥다이브 콘텐츠를 선호

작업:
1. 주어진 기사 목록에서 아래 3개 카테고리에 해당하는 기사만 골라주세요:
   - "ai": AI, LLM, 코딩 에이전트, ML 관련
   - "web": 웹 표준, 브라우저 API, 웹 성능, Node.js, npm, Rust/WASM 등
   - "frontend": React, Next.js, TypeScript, CSS, UI 프레임워크 등
2. 각 카테고리별 5~10개 기사를 선정하고 한국어 한줄 설명을 붙여주세요.
3. 전체 기사 중 독자가 가장 좋아할 기사 3개를 "picks"로 선정하고, 한국어 3-4문장 요약을 작성해주세요.
4. **중요: picks에 선정된 기사는 categories에 포함하지 마세요. picks와 categories는 서로 겹치지 않아야 합니다.**
5. 광고, 구인 공고, 기술과 무관한 기사는 제외하세요.
6. 중복 주제는 가장 좋은 것 하나만 선택하세요.

반드시 아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{
  "categories": {
    "ai": [{ "title": "원제목", "url": "URL", "oneliner": "한줄 설명", "category": "ai" }],
    "web": [{ "title": "원제목", "url": "URL", "oneliner": "한줄 설명", "category": "web" }],
    "frontend": [{ "title": "원제목", "url": "URL", "oneliner": "한줄 설명", "category": "frontend" }]
  },
  "picks": [
    { "title": "원제목", "url": "URL", "summary": "한국어 3-4문장 요약" }
  ]
}`

export async function curateArticles(
  articles: Article[],
  apiKey: string,
): Promise<CurationResult> {
  const articleList = articles
    .map((a, i) => `${i + 1}. [${a.source}] ${a.title} — ${a.url}`)
    .join('\n')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `오늘의 기사 목록 (${articles.length}개):\n\n${articleList}`,
        },
      ],
    }),
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Claude API error: ${res.status} ${error}`)
  }

  const data: any = await res.json()
  const text = data.content?.[0]?.text ?? ''

  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/)
  if (!jsonMatch) {
    throw new Error('Failed to parse AI response as JSON')
  }

  return JSON.parse(jsonMatch[1]) as CurationResult
}
