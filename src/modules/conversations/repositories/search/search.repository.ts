import { singleton } from 'tsyringe'
export interface ISearchResultItem {
  title: string
  url: string
  snippet: string
}

@singleton()
export default class SearchRepository {
  private apiUrl: string

  constructor() {
    this.apiUrl = `https://www.googleapis.com/customsearch/v1?key=${process.env.SEARCH_API_KEY}&cx=${process.env.SEARCH_API_KEY_CX}&q=`
  }

  /**
   * Run the external search and return normalized results.
   */
  private async rawSearch(query: string): Promise<ISearchResultItem[]> {
    try {
      const url = `${this.apiUrl}${encodeURIComponent(query)}`
      const res = await fetch(url)

      if (!res.ok) return []
      const data: any = await res.json()

      // Basic normalization; adapt as needed for the provider.
      const items = data?.results || data?.items || []
      return items
        .filter((it: any) => (it?.title || it?.name) && (it?.link || it?.url))
        .slice(0, 5)
        .map((it: any) => ({
          title: (it.title || it.name || '').toString().slice(0, 160),
          url: (it.url || it.link || it.source || '').toString(),
          snippet: (it.snippet || it.description || it.excerpt || '').toString().slice(0, 260),
        }))
    } catch (_e) {
      return []
    }
  }

  async search(query: string): Promise<string> {
    const q = (query || '').trim().slice(0, 180)
    if (!q) return 'No se encontró información relevante.'
    const raw = await this.rawSearch(q)
    return this.compressResults(raw, q)
  }

  async searchRaw(query: string): Promise<ISearchResultItem[]> {
    const q = (query || '').trim().slice(0, 180)
    if (!q) return []
    return await this.rawSearch(q)
  }

  private compressResults(results: ISearchResultItem[], query: string): string {
    let responseSanity = ''
    results.forEach((item) => {
      responseSanity += `- ${item.title}. ${item.snippet}\n`
    })
    return responseSanity
  }

  buildCondensedContext(results: ISearchResultItem[]): string {
    return results.map((r, i) => `(${i + 1}) ${r.title}\n${r.snippet}\n${r.url}`).join('\n\n')
  }
}
