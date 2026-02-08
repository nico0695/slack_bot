import LinksMetadataRepository from '../linksMetadata.repository'
import axios from 'axios'

jest.mock('axios')
const mockedAxios = axios as jest.Mocked<typeof axios>

const mockLogFns = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  fatal: jest.fn(),
}

jest.mock('../../../../../config/logger', () => ({
  createModuleLogger: jest.fn().mockReturnValue({
    info: (...args: any[]) => mockLogFns.info(...args),
    error: (...args: any[]) => mockLogFns.error(...args),
    warn: (...args: any[]) => mockLogFns.warn(...args),
    debug: (...args: any[]) => mockLogFns.debug(...args),
    fatal: (...args: any[]) => mockLogFns.fatal(...args),
  }),
}))

describe('LinksMetadataRepository', () => {
  let repository: LinksMetadataRepository

  beforeEach(() => {
    jest.clearAllMocks()
    repository = LinksMetadataRepository.getInstance()
  })

  describe('Singleton Pattern', () => {
    it('should return the same instance on multiple calls', () => {
      const instance1 = LinksMetadataRepository.getInstance()
      const instance2 = LinksMetadataRepository.getInstance()
      expect(instance1).toBe(instance2)
    })
  })

  describe('fetchMetadata', () => {
    it('should extract og:title and og:description', async () => {
      mockedAxios.get.mockResolvedValue({
        data: `
          <html>
          <head>
            <title>Page Title</title>
            <meta property="og:title" content="OG Title">
            <meta property="og:description" content="OG Description">
          </head>
          </html>
        `,
      })

      const result = await repository.fetchMetadata('https://example.com')

      expect(result).toEqual({
        title: 'OG Title',
        description: 'OG Description',
      })
    })

    it('should prefer og:title over html title', async () => {
      mockedAxios.get.mockResolvedValue({
        data: `
          <html><head>
            <title>HTML Title</title>
            <meta property="og:title" content="OG Title">
          </head></html>
        `,
      })

      const result = await repository.fetchMetadata('https://example.com')

      expect(result?.title).toBe('OG Title')
    })

    it('should fall back to html title when og:title is absent', async () => {
      mockedAxios.get.mockResolvedValue({
        data: '<html><head><title>Only HTML Title</title></head></html>',
      })

      const result = await repository.fetchMetadata('https://example.com')

      expect(result?.title).toBe('Only HTML Title')
    })

    it('should fall back to meta description when og:description is absent', async () => {
      mockedAxios.get.mockResolvedValue({
        data: `
          <html><head>
            <title>Title</title>
            <meta name="description" content="Meta Description">
          </head></html>
        `,
      })

      const result = await repository.fetchMetadata('https://example.com')

      expect(result?.description).toBe('Meta Description')
    })

    it('should handle meta tags with content attribute first', async () => {
      mockedAxios.get.mockResolvedValue({
        data: `
          <html><head>
            <meta content="Reversed OG Title" property="og:title">
            <meta content="Reversed Description" property="og:description">
          </head></html>
        `,
      })

      const result = await repository.fetchMetadata('https://example.com')

      expect(result?.title).toBe('Reversed OG Title')
      expect(result?.description).toBe('Reversed Description')
    })

    it('should return undefined fields when no metadata is found', async () => {
      mockedAxios.get.mockResolvedValue({
        data: '<html><head></head><body>No metadata</body></html>',
      })

      const result = await repository.fetchMetadata('https://example.com')

      expect(result).toEqual({ title: undefined, description: undefined })
    })

    it('should decode HTML entities', async () => {
      mockedAxios.get.mockResolvedValue({
        data: '<html><head><title>Tom &amp; Jerry&#39;s &quot;Adventure&quot;</title></head></html>',
      })

      const result = await repository.fetchMetadata('https://example.com')

      expect(result?.title).toBe('Tom & Jerry\'s "Adventure"')
    })

    it('should return null for invalid URL protocol', async () => {
      const result = await repository.fetchMetadata('ftp://example.com')

      expect(result).toBeNull()
      expect(mockedAxios.get).not.toHaveBeenCalled()
      expect(mockLogFns.warn).toHaveBeenCalled()
    })

    it('should return null on network error', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Network Error'))

      const result = await repository.fetchMetadata('https://example.com')

      expect(result).toBeNull()
      expect(mockLogFns.debug).toHaveBeenCalled()
    })

    it('should return null on timeout', async () => {
      const timeoutError: any = new Error('timeout of 5000ms exceeded')
      timeoutError.code = 'ECONNABORTED'
      mockedAxios.get.mockRejectedValue(timeoutError)

      const result = await repository.fetchMetadata('https://slow-site.com')

      expect(result).toBeNull()
    })

    it('should return null when response is not a string', async () => {
      mockedAxios.get.mockResolvedValue({ data: null })

      const result = await repository.fetchMetadata('https://example.com')

      expect(result).toBeNull()
    })

    it('should pass correct axios options', async () => {
      mockedAxios.get.mockResolvedValue({ data: '<html><head></head></html>' })

      await repository.fetchMetadata('https://example.com')

      expect(mockedAxios.get).toHaveBeenCalledWith('https://example.com', {
        timeout: 5000,
        maxContentLength: 32 * 1024,
        maxRedirects: 3,
        headers: {
          'User-Agent': 'SlackBot-LinkPreview/1.0',
          Accept: 'text/html',
        },
        responseType: 'text',
      })
    })
  })
})
