import OpenaiImagesRepository from '../openaiImages.repository'
import { ImageProvider } from '../../../shared/interfaces/images.interfaces'
import axios from 'axios'

// Mock axios
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

describe('OpenaiImagesRepository', () => {
  let repository: OpenaiImagesRepository

  // Test environment variable validation first, before creating any instance
  describe('Environment Variables', () => {
    it('should throw error if OPENAI_API_KEY is not defined', () => {
      const originalKey = process.env.OPENAI_API_KEY
      delete process.env.OPENAI_API_KEY

      expect(() => new OpenaiImagesRepository()).toThrow(
        'OPENAI_API_KEY is not defined in the environment variables.'
      )

      if (originalKey) process.env.OPENAI_API_KEY = originalKey
    })
  })

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.OPENAI_API_KEY = 'test-key'
    repository = new OpenaiImagesRepository()
  })

  afterEach(() => {
    delete process.env.OPENAI_API_KEY
  })

  describe('generateImage', () => {
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const mockB64Response = (count = 1) => ({
      data: {
        data: Array.from({ length: count }, (_, i) => ({
          b64_json: `base64-image-data-${i}`,
        })),
      },
    })

    it('should generate image successfully with default options', async () => {
      mockedAxios.post.mockResolvedValue(mockB64Response())

      const result = await repository.generateImage('a beautiful sunset')

      expect(result).not.toBeNull()
      expect(result?.provider).toBe(ImageProvider.OPENAI)
      expect(result?.images).toHaveLength(1)
      expect(result?.images[0].b64).toBe('base64-image-data-0')
      expect(result?.images[0].url).toBeUndefined()
      expect(result?.images[0].id).toMatch(/^openai-\d+-0$/)

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.openai.com/v1/images/generations',
        {
          model: 'gpt-image-1',
          prompt: 'a beautiful sunset',
          n: 1,
          size: '1024x1024',
          quality: 'medium',
        },
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: expect.stringContaining('Bearer'),
          }),
        })
      )
    })

    it('should generate image with native gpt-image-1 options', async () => {
      mockedAxios.post.mockResolvedValue(mockB64Response())

      const result = await repository.generateImage('a beautiful landscape', {
        size: '1536x1024',
        quality: 'high',
      })

      expect(result).not.toBeNull()
      expect(result?.images).toHaveLength(1)

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.openai.com/v1/images/generations',
        expect.objectContaining({
          size: '1536x1024',
          quality: 'high',
        }),
        expect.any(Object)
      )
    })

    it('should map legacy DALL-E 3 options (hd/1024x1792) to gpt-image-1 equivalents', async () => {
      mockedAxios.post.mockResolvedValue(mockB64Response())

      await repository.generateImage('a beautiful landscape', {
        size: '1024x1792',
        quality: 'hd',
      })

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          size: '1024x1536',
          quality: 'high',
        }),
        expect.any(Object)
      )
    })

    it('should not send the style parameter (removed by OpenAI)', async () => {
      mockedAxios.post.mockResolvedValue(mockB64Response())

      await repository.generateImage('test prompt')

      const requestBody = mockedAxios.post.mock.calls[0][1]
      expect(requestBody).not.toHaveProperty('style')
      expect(requestBody).not.toHaveProperty('response_format')
    })

    it('should upgrade 512x512 to 1024x1024 (gpt-image-1 does not support 512)', async () => {
      mockedAxios.post.mockResolvedValue(mockB64Response())

      await repository.generateImage('test prompt', { size: '512x512' })

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          size: '1024x1024', // Upgraded from 512x512
        }),
        expect.any(Object)
      )
    })

    it('should request multiple images when numberOfImages is set', async () => {
      mockedAxios.post.mockResolvedValue(mockB64Response(3))

      const result = await repository.generateImage('test prompt', { numberOfImages: 3 })

      expect(result?.images).toHaveLength(3)
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ n: 3 }),
        expect.any(Object)
      )
    })

    it('should floor fractional numberOfImages before sending n', async () => {
      mockedAxios.post.mockResolvedValue(mockB64Response(2))

      await repository.generateImage('test prompt', { numberOfImages: 2.5 })

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ n: 2 }),
        expect.any(Object)
      )
    })

    it('should skip response items without b64_json and return null if none remain', async () => {
      mockedAxios.post.mockResolvedValue({
        data: {
          data: [{ revised_prompt: 'no image here' }, { b64_json: 'valid-b64' }],
        },
      })

      const partial = await repository.generateImage('test prompt')
      expect(partial?.images).toHaveLength(1)
      expect(partial?.images[0].b64).toBe('valid-b64')

      mockedAxios.post.mockResolvedValue({
        data: { data: [{ revised_prompt: 'no image here' }] },
      })

      const empty = await repository.generateImage('test prompt')
      expect(empty).toBeNull()
    })

    it('should return null when API returns no images', async () => {
      const mockResponse = {
        data: {
          data: [],
        },
      }

      mockedAxios.post.mockResolvedValue(mockResponse)

      const result = await repository.generateImage('invalid prompt')

      expect(result).toBeNull()
    })

    it('should return null on API error', async () => {
      mockedAxios.post.mockRejectedValue(new Error('API Error'))

      const result = await repository.generateImage('test prompt')

      expect(result).toBeNull()
      expect(mockLogFns.error).toHaveBeenCalledWith(
        { err: expect.any(Error) },
        'OpenAI Images API generateImage failed'
      )
    })

    it('should handle rate limit error (429)', async () => {
      const rateLimitError: any = new Error('Rate limit exceeded')
      rateLimitError.response = { status: 429 }

      mockedAxios.post.mockRejectedValue(rateLimitError)

      const result = await repository.generateImage('test prompt')

      expect(result).toBeNull()
      expect(mockLogFns.warn).toHaveBeenCalledWith('OpenAI Images API rate limit exceeded')
    })

    it('should handle API error with detailed message', async () => {
      const apiError: any = new Error('API Error')
      apiError.response = {
        data: {
          error: {
            message: 'Invalid prompt content',
          },
        },
      }

      mockedAxios.post.mockRejectedValue(apiError)

      const result = await repository.generateImage('test prompt')

      expect(result).toBeNull()
      expect(mockLogFns.error).toHaveBeenCalledWith(
        { err: expect.any(Error) },
        'OpenAI Images API generateImage failed'
      )
    })
  })
})
