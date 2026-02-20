import type { Article } from './types'
import { HN_TOP_STORIES_COUNT } from '../config'

const HN_API = 'https://hacker-news.firebaseio.com/v0'

interface HNItem {
  id: number
  title: string
  url?: string
  score: number
  time: number
  type: string
}

async function fetchItem(id: number): Promise<HNItem | null> {
  try {
    const res = await fetch(`${HN_API}/item/${id}.json`)
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function fetchHackerNews(): Promise<Article[]> {
  try {
    const res = await fetch(`${HN_API}/topstories.json`)
    if (!res.ok) return []
    const ids: number[] = await res.json()
    const topIds = ids.slice(0, HN_TOP_STORIES_COUNT)

    const items = await Promise.allSettled(topIds.map(fetchItem))
    return items
      .map((r) => (r.status === 'fulfilled' ? r.value : null))
      .filter((item): item is HNItem => item !== null && item.url !== undefined)
      .map((item) => ({
        title: item.title,
        url: item.url!,
        description: '',
        source: 'Hacker News',
        publishedAt: new Date(item.time * 1000).toISOString(),
      }))
  } catch {
    console.error('Failed to fetch Hacker News')
    return []
  }
}
