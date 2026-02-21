import { fetchAllRSS } from './sources/rss'
import { fetchHackerNews } from './sources/hackernews'
import { curateArticles } from './ai/curator'
import { sendToDiscord } from './discord/sender'
import type { Article } from './sources/types'

interface Env {
  ANTHROPIC_API_KEY: string
  DISCORD_WEBHOOK_URL: string
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

async function runPipeline(env: Env): Promise<string> {
  console.log('Fetching articles from all sources...')
  const [rssArticles, hnArticles] = await Promise.all([
    fetchAllRSS(),
    fetchHackerNews(),
  ])

  const raw = [...rssArticles, ...hnArticles]
  console.log(`Fetched ${raw.length} articles total`)

  const articles = filterRecent(deduplicateByUrl(raw))
  console.log(`${articles.length} articles after recent + url dedup`)

  if (articles.length === 0) {
    return 'No articles fetched from any source'
  }

  console.log(`Curating ${articles.length} articles with Claude...`)
  const curated = await curateArticles(articles, env.ANTHROPIC_API_KEY)

  const counts = Object.entries(curated.categories)
    .map(([k, v]) => `${k}: ${v.length}`)
    .join(', ')
  console.log(`Curated: ${counts}, picks: ${curated.picks.length}`)

  console.log('Sending to Discord...')
  await sendToDiscord(curated, env.DISCORD_WEBHOOK_URL)

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
