export interface ISearchResultItem {
  title: string
  url: string
  snippet: string
}

export default class SearchRepository {
  private static instance: SearchRepository

  private apiUrl: string

  private constructor() {
    this.apiUrl = `https://www.googleapis.com/customsearch/v1?key=${process.env.SEARCH_API_KEY}&cx=${process.env.SEARCH_API_KEY_CX}&q=`
  }

  static getInstance(): SearchRepository {
    if (this.instance) return this.instance
    this.instance = new SearchRepository()
    return this.instance
  }

  /**
   * Ejecuta búsqueda externa cruda.
   * Devuelve arreglo simplificado de { title, url, snippet }.
   */
  private async rawSearch(query: string): Promise<ISearchResultItem[]> {
    try {
      const url = `${this.apiUrl}${encodeURIComponent(query)}`
      const res = await fetch(url)

      if (!res.ok) return []
      const data: any = await res.json()

      // Normalización muy básica; adaptar a proveedor real.
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

  /**
   * Public search method returning normalized results (no AI summarization here).
   */
  async search(query: string): Promise<string> {
    const q = (query || '').trim().slice(0, 180)
    if (!q) return 'No se encontró información relevante.'
    const raw = await this.rawSearch(q)
    return this.compressResults(raw, q)
  }

  /**
   * Keep a raw variant (uncompressed) if needed externally later.
   */
  async searchRaw(query: string): Promise<ISearchResultItem[]> {
    const q = (query || '').trim().slice(0, 180)
    if (!q) return []
    return await this.rawSearch(q)
  }

  /**
   * Reduce noise: dedupe, shorten, pick most relevant sentence, score & slice.
   */
  private compressResults(results: ISearchResultItem[], query: string): string {
    let responseSanity = ''
    results.forEach((item) => {
      responseSanity += `- ${item.title}. ${item.snippet}\n`
    })
    return responseSanity
  }

  /**
   * Helper to build condensed context externally if desired.
   */
  buildCondensedContext(results: ISearchResultItem[]): string {
    return results.map((r, i) => `(${i + 1}) ${r.title}\n${r.snippet}\n${r.url}`).join('\n\n')
  }
}
