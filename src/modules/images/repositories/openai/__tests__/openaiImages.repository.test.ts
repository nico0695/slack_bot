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

      if (originalKey) {
        expect(true).toBe(true)
        return
      }

      delete process.env.OPENAI_API_KEY

      expect(() => {
        OpenaiImagesRepository.getInstance()
      }).toThrow('OPENAI_API_KEY is not defined in the environment variables.')

      process.env.OPENAI_API_KEY = originalKey
    })
  })

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.OPENAI_API_KEY = 'test-key'
    repository = OpenaiImagesRepository.getInstance()
  })

  afterEach(() => {
    delete process.env.OPENAI_API_KEY
  })

  describe('Singleton Pattern', () => {
    it('should return the same instance on multiple calls', () => {
      const instance1 = OpenaiImagesRepository.getInstance()
      const instance2 = OpenaiImagesRepository.getInstance()

      expect(instance1).toBe(instance2)
    })
  })

  describe('generateImage', () => {
    it('should generate image successfully with default options', async () => {
      const mockResponse = {
        data: {
          data: [
            {
              url: 'https://example.com/generated-image.png',
            },
          ],
        },
      }

      mockedAxios.post.mockResolvedValue(mockResponse)

      const result = await repository.generateImage('a beautiful sunset')

      expect(result).not.toBeNull()
      expect(result?.provider).toBe(ImageProvider.OPENAI)
      expect(result?.images).toHaveLength(1)
      expect(result?.images[0].url).toBe('https://example.com/generated-image.png')
      expect(result?.images[0].id).toMatch(/^openai-\d+$/)

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.openai.com/v1/images/generations',
        {
          model: 'dall-e-3',
          prompt: 'a beautiful sunset',
          n: 1,
          size: '1024x1024',
          quality: 'standard',
          style: 'vivid',
        },
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: expect.stringContaining('Bearer'),
          }),
        })
      )
    })

    it('should generate image with custom options', async () => {
      const mockResponse = {
        data: {
          data: [
            {
              url: 'https://example.com/hd-image.png',
            },
          ],
        },
      }

      mockedAxios.post.mockResolvedValue(mockResponse)

      const result = await repository.generateImage('a beautiful landscape', {
        size: '1024x1792',
        quality: 'hd',
        style: 'natural',
      })

      expect(result).not.toBeNull()
      expect(result?.images).toHaveLength(1)

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.openai.com/v1/images/generations',
        expect.objectContaining({
          size: '1024x1792',
          quality: 'hd',
          style: 'natural',
        }),
        expect.any(Object)
      )
    })

    it('should upgrade 512x512 to 1024x1024 (DALL-E 3 does not support 512)', async () => {
      const mockResponse = {
        data: {
          data: [
            {
              url: 'https://example.com/image.png',
            },
          ],
        },
      }

      mockedAxios.post.mockResolvedValue(mockResponse)

      await repository.generateImage('test prompt', { size: '512x512' })

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          size: '1024x1024', // Upgraded from 512x512
        }),
        expect.any(Object)
      )
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
