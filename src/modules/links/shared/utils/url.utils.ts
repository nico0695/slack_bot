export function extractTitleFromUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname.replace(/^www\./, '')

    const pathSegments = parsed.pathname.split('/').filter((segment) => segment.length > 0)

    if (pathSegments.length === 0) {
      return hostname
    }

    const cleanedSegments = pathSegments
      .map((segment) => decodeURIComponent(segment))
      .map((segment) => segment.replace(/[-_]/g, ' '))
      .map((segment) => segment.replace(/\.\w+$/, ''))
      .filter((segment) => segment.trim().length > 1)

    if (cleanedSegments.length === 0) {
      return hostname
    }

    return `${hostname} - ${cleanedSegments.join('/')}`
  } catch {
    return url
  }
}
