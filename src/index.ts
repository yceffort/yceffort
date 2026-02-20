import { fetchAllRSS } from './sources/rss'
import { fetchHackerNews } from './sources/hackernews'
import { fetchAllReddit } from './sources/reddit'
import { curateArticles } from './ai/curator'
import { sendToDiscord } from './discord/sender'
import { KV_TTL_SECONDS } from './config'
import type { Article } from './sources/types'

interface Env {
  ANTHROPIC_API_KEY: string
  DISCORD_WEBHOOK_URL: string
  NEWSLETTER_KV: KVNamespace
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000

function filterRecent(articles: Article[]): Article[] {
  const cutoff = Date.now() - ONE_DAY_MS
  return articles.filter((a) => {
    if (!a.publishedAt) return true // 날짜 없으면 포함
    const ts = new Date(a.publishedAt).getTime()
    return isNaN(ts) || ts > cutoff
  })
}

function deduplicateByUrl(articles: Article[]): Article[] {
  const seen = new Set<string>()
  return articles.filter((a) => {
    if (seen.has(a.url)) return false
    seen.add(a.url)
    return true
  })
}

async function deduplicateWithKV(
  articles: Article[],
  kv: KVNamespace,
): Promise<Article[]> {
  // 배치로 나눠서 KV 체크 (subrequest 제한 방지)
  const BATCH = 50
  const unique: Article[] = []
  for (let i = 0; i < articles.length; i += BATCH) {
    const batch = articles.slice(i, i + BATCH)
    const checks = await Promise.all(
      batch.map(async (a) => ({ article: a, exists: await kv.get(a.url) })),
    )
    unique.push(...checks.filter((c) => !c.exists).map((c) => c.article))
  }
  return unique
}

async function markAsSent(urls: string[], kv: KVNamespace): Promise<void> {
  await Promise.all(
    urls.map((url) => kv.put(url, '1', { expirationTtl: KV_TTL_SECONDS })),
  )
}

async function runPipeline(env: Env): Promise<string> {
  console.log('Fetching articles from all sources...')
  const [rssArticles, hnArticles, redditArticles] = await Promise.all([
    fetchAllRSS(),
    fetchHackerNews(),
    fetchAllReddit(),
  ])

  const raw = [...rssArticles, ...hnArticles, ...redditArticles]
  console.log(`Fetched ${raw.length} articles total`)

  const recent = filterRecent(deduplicateByUrl(raw))
  console.log(`${recent.length} articles after recent + url dedup`)

  if (recent.length === 0) {
    return 'No articles fetched from any source'
  }

  // 최대 200개만 KV 체크 (subrequest 절약)
  const capped = recent.slice(0, 200)
  const newArticles = await deduplicateWithKV(capped, env.NEWSLETTER_KV)
  console.log(`${newArticles.length} new articles after dedup`)

  if (newArticles.length === 0) {
    return 'No new articles to curate'
  }

  // Claude API 응답 시간 절약: 최대 30개만 전송
  const forCuration = newArticles.slice(0, 30)
  console.log(`Curating ${forCuration.length} articles with Claude...`)
  const curated = await curateArticles(forCuration, env.ANTHROPIC_API_KEY)

  const counts = Object.entries(curated.categories)
    .map(([k, v]) => `${k}: ${v.length}`)
    .join(', ')
  console.log(`Curated: ${counts}, picks: ${curated.picks.length}`)

  console.log('Sending to Discord...')
  await sendToDiscord(curated, env.DISCORD_WEBHOOK_URL)

  const sentUrls = [
    ...Object.values(curated.categories).flat().map((a) => a.url),
    ...curated.picks.map((a) => a.url),
  ]
  await markAsSent([...new Set(sentUrls)], env.NEWSLETTER_KV)

  return `Done: ${counts}, picks: ${curated.picks.length}`
}

export default {
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(
      runPipeline(env).then(
        (msg) => console.log(msg),
        (err) => console.error('Pipeline failed:', err),
      ),
    )
  },

  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/run') {
      try {
        const result = await runPipeline(env)
        return new Response(result, { status: 200 })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        console.error('Pipeline failed:', err)
        return new Response(`Error: ${message}`, { status: 500 })
      }
    }

    return new Response('AI Newsletter Bot. GET /run to trigger manually.', {
      status: 200,
    })
  },
}
