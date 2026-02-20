export interface Article {
  title: string
  url: string
  description: string
  source: string
  publishedAt: string
}

export type Category = 'ai' | 'web' | 'frontend'

export interface CategoryArticle {
  title: string
  url: string
  oneliner: string
  category: Category
}

export interface PickArticle {
  title: string
  url: string
  summary: string
}

export interface CurationResult {
  categories: {
    ai: CategoryArticle[]
    web: CategoryArticle[]
    frontend: CategoryArticle[]
  }
  picks: PickArticle[]
}
