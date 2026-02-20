import type { Article } from './types'
import { SUBREDDITS } from '../config'

interface RedditPost {
  data: {
    title: string
    url: string
    selftext: string
    permalink: string
    created_utc: number
    is_self: boolean
  }
}

async function fetchSubreddit(subreddit: string): Promise<Article[]> {
  try {
    const res = await fetch(`https://www.reddit.com/r/${subreddit}/hot.json?limit=10`, {
      headers: { 'User-Agent': 'ai-newsletter-bot/1.0' },
    })
    if (!res.ok) return []
    const data: { data?: { children?: RedditPost[] } } = await res.json()
    const posts: RedditPost[] = data?.data?.children ?? []

    return posts
      .filter((p) => !p.data.is_self)
      .map((p) => ({
        title: p.data.title,
        url: p.data.url,
        description: p.data.selftext.slice(0, 500),
        source: `r/${subreddit}`,
        publishedAt: new Date(p.data.created_utc * 1000).toISOString(),
      }))
  } catch {
    console.error(`Failed to fetch r/${subreddit}`)
    return []
  }
}

export async function fetchAllReddit(): Promise<Article[]> {
  const results = await Promise.allSettled(SUBREDDITS.map(fetchSubreddit))
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
}
