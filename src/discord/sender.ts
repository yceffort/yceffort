import type { CurationResult, CategoryArticle } from '../sources/types'

const MAX_EMBED_LENGTH = 4096
const MAX_TOTAL_LENGTH = 6000

interface DiscordEmbed {
  title?: string
  description?: string
  color?: number
}

const CATEGORY_CONFIG = {
  ai: { label: '🤖 AI', color: 0xed4245 },
  web: { label: '🌐 Web', color: 0x5865f2 },
  frontend: { label: '⚛️ Frontend', color: 0x57f287 },
} as const

function buildCategoryEmbed(key: keyof typeof CATEGORY_CONFIG, articles: CategoryArticle[]): DiscordEmbed | null {
  if (articles.length === 0) return null
  const { label, color } = CATEGORY_CONFIG[key]
  const lines = articles.map((a) => `- [${a.title}](${a.url})\n  ${a.oneliner}`)
  return {
    title: label,
    description: lines.join('\n').slice(0, MAX_EMBED_LENGTH),
    color,
  }
}

function buildPicksEmbed(result: CurationResult): DiscordEmbed | null {
  if (result.picks.length === 0) return null
  const lines = result.picks.map(
    (a, i) => `**${i + 1}. [${a.title}](${a.url})**\n${a.summary}`,
  )
  return {
    title: '⭐ 오늘의 Pick',
    description: lines.join('\n\n').slice(0, MAX_EMBED_LENGTH),
    color: 0xfee75c, // yellow
  }
}

function chunkEmbeds(embeds: DiscordEmbed[]): DiscordEmbed[][] {
  const chunks: DiscordEmbed[][] = []
  let current: DiscordEmbed[] = []
  let currentLength = 0

  for (const embed of embeds) {
    const len = (embed.title?.length ?? 0) + (embed.description?.length ?? 0)
    if (current.length > 0 && currentLength + len > MAX_TOTAL_LENGTH) {
      chunks.push(current)
      current = []
      currentLength = 0
    }
    current.push(embed)
    currentLength += len
  }

  if (current.length > 0) chunks.push(current)
  return chunks
}

export async function sendToDiscord(
  result: CurationResult,
  webhookUrl: string,
): Promise<void> {
  const today = new Date().toISOString().split('T')[0]

  await postWebhook(webhookUrl, {
    content: `# 🗞️ AI 기술 뉴스레터 — ${today}`,
  })

  const picksEmbed = buildPicksEmbed(result)
  if (picksEmbed) {
    await postWebhook(webhookUrl, { embeds: [picksEmbed] })
  }

  const categoryEmbeds = (
    ['ai', 'web', 'frontend'] as const
  )
    .map((key) => buildCategoryEmbed(key, result.categories[key]))
    .filter((e): e is DiscordEmbed => e !== null)

  for (const chunk of chunkEmbeds(categoryEmbeds)) {
    await postWebhook(webhookUrl, { embeds: chunk })
  }
}

async function postWebhook(url: string, body: object): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    console.error(`Discord webhook error: ${res.status} ${text}`)
  }
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('Retry-After') ?? '2')
    await new Promise((r) => setTimeout(r, retryAfter * 1000))
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }
}
