import { XMLParser } from 'fast-xml-parser'
import type { Article } from './types'
import { RSS_FEEDS } from '../config'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
})

function parseRSSItems(data: any, feedName: string): Article[] {
  // RSS 2.0
  const rssItems = data?.rss?.channel?.item
  if (rssItems) {
    const items = Array.isArray(rssItems) ? rssItems : [rssItems]
    return items.map((item: any) => ({
      title: item.title ?? '',
      url: item.link ?? '',
      description: stripHtml(item.description ?? ''),
      source: feedName,
      publishedAt: item.pubDate ?? '',
    }))
  }

  // Atom
  const atomEntries = data?.feed?.entry
  if (atomEntries) {
    const entries = Array.isArray(atomEntries) ? atomEntries : [atomEntries]
    return entries.map((entry: any) => {
      const link = Array.isArray(entry.link)
        ? entry.link.find((l: any) => l['@_rel'] === 'alternate')?.['@_href'] ?? entry.link[0]?.['@_href']
        : entry.link?.['@_href'] ?? ''
      return {
        title: typeof entry.title === 'string' ? entry.title : entry.title?.['#text'] ?? '',
        url: link,
        description: stripHtml(entry.summary ?? entry.content ?? ''),
        source: feedName,
        publishedAt: entry.published ?? entry.updated ?? '',
      }
    })
  }

  return []
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim().slice(0, 500)
}

async function fetchFeed(feed: { url: string; name: string }): Promise<Article[]> {
  try {
    const res = await fetch(feed.url, {
      headers: { 'User-Agent': 'ai-newsletter-bot/1.0' },
    })
    if (!res.ok) return []
    const xml = await res.text()
    const data = parser.parse(xml)
    return parseRSSItems(data, feed.name)
  } catch {
    console.error(`Failed to fetch RSS: ${feed.name}`)
    return []
  }
}

export async function fetchAllRSS(): Promise<Article[]> {
  const results = await Promise.allSettled(RSS_FEEDS.map(fetchFeed))
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
}
