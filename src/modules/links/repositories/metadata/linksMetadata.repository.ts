import axios from 'axios'
import { createModuleLogger } from '../../../../config/logger'
import { ILinkMetadata } from '../../shared/interfaces/links.interfaces'

const log = createModuleLogger('links.metadata')

export default class LinksMetadataRepository {
  static #instance: LinksMetadataRepository

  private constructor() {}

  static getInstance(): LinksMetadataRepository {
    if (this.#instance) {
      return this.#instance
    }

    this.#instance = new LinksMetadataRepository()
    return this.#instance
  }

  /**
   * Fetch metadata (title, description) from a URL by parsing the HTML head.
   * Returns null if the fetch fails or the URL is invalid.
   */
  async fetchMetadata(url: string): Promise<ILinkMetadata | null> {
    try {
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        log.warn({ url }, 'Invalid URL protocol')
        return null
      }

      const response = await axios.get(url, {
        timeout: 5000,
        maxContentLength: 32 * 1024,
        maxRedirects: 3,
        headers: {
          'User-Agent': 'SlackBot-LinkPreview/1.0',
          Accept: 'text/html',
        },
        responseType: 'text',
      })

      const html: string = typeof response.data === 'string' ? response.data : ''
      if (!html) {
        return null
      }

      return this.#extractMetadata(html)
    } catch (error) {
      log.debug({ err: error, url }, 'Failed to fetch metadata')
      return null
    }
  }

  #extractMetadata(html: string): ILinkMetadata {
    const ogTitle = this.#extractMetaContent(html, 'property', 'og:title')
    const htmlTitle = this.#extractHtmlTitle(html)
    const ogDescription = this.#extractMetaContent(html, 'property', 'og:description')
    const metaDescription = this.#extractMetaContent(html, 'name', 'description')

    const title = ogTitle || htmlTitle || undefined
    const description = ogDescription || metaDescription || undefined

    return { title, description }
  }

  #extractHtmlTitle(html: string): string | null {
    const match = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    return match ? this.#decodeHtmlEntities(match[1].trim()) : null
  }

  #extractMetaContent(html: string, attr: string, value: string): string | null {
    // Match both orderings: attr before content and content before attr
    const pattern1 = new RegExp(
      `<meta\\s+${attr}=["']${value}["']\\s+content=["']([^"']+)["']`,
      'i'
    )
    const pattern2 = new RegExp(
      `<meta\\s+content=["']([^"']+)["']\\s+${attr}=["']${value}["']`,
      'i'
    )

    const match = html.match(pattern1) || html.match(pattern2)
    return match ? this.#decodeHtmlEntities(match[1].trim()) : null
  }

  #decodeHtmlEntities(text: string): string {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
  }
}
