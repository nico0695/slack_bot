import axios from 'axios'
import { createModuleLogger } from '../../../../config/logger'
import {
  IImageRepository,
  IImageGenerationOptions,
  IImageGenerationResponse,
  ImageProvider,
} from '../../shared/interfaces/images.interfaces'

const log = createModuleLogger('openai.images')

/**
 * OpenAI DALL-E 3 Image Generation Repository
 * Implements IImageRepository interface following the same pattern as conversations module
 *
 * Uses REST API via axios (similar to LeapRepository) to maintain consistency
 * and avoid breaking changes in the legacy openai v3.2.1 package used by conversations
 */
export default class OpenaiImagesRepository implements IImageRepository {
  static #instance: OpenaiImagesRepository

  #apiKey: string
  #baseUrl = 'https://api.openai.com/v1'

  private constructor() {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not defined in the environment variables.')
    }

    this.#apiKey = apiKey
    this.generateImage = this.generateImage.bind(this)
  }

  static getInstance(): OpenaiImagesRepository {
    if (this.#instance) {
      return this.#instance
    }

    this.#instance = new OpenaiImagesRepository()
    return this.#instance
  }

  /**
   * Generate image using DALL-E 3 (IImageRepository interface implementation)
   * DALL-E 3 is synchronous - no polling required
   *
   * @param prompt - Text description of the image to generate
   * @param options - Generation options (size, quality, style)
   * @returns Unified response with generated image or null on error
   */
  async generateImage(
    prompt: string,
    options?: IImageGenerationOptions
  ): Promise<IImageGenerationResponse | null> {
    try {
      // Map options to DALL-E 3 parameters
      const size = this.#mapSize(options?.size)
      const quality = options?.quality || 'standard'
      const style = options?.style || 'vivid'

      // DALL-E 3 only supports n=1
      const requestBody = {
        model: 'dall-e-3',
        prompt,
        n: 1,
        size,
        quality,
        style,
      }

      const response = await axios.post(`${this.#baseUrl}/images/generations`, requestBody, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.#apiKey}`,
        },
      })

      // DALL-E 3 returns images immediately (no polling needed)
      if (!response.data?.data || response.data.data.length === 0) {
        return null
      }

      return {
        images: response.data.data.map((img: any) => ({
          url: img.url,
          id: `openai-${Date.now()}`,
          createdAt: new Date().toISOString(),
        })),
        provider: ImageProvider.OPENAI,
      }
    } catch (error: any) {
      if (error.response?.status === 429) {
        log.warn('OpenAI Images API rate limit exceeded')
      } else {
        log.error({ err: error }, 'OpenAI Images API generateImage failed')
      }
      return null
    }
  }

  /**
   * Map generic size options to DALL-E 3 supported sizes
   * DALL-E 3 supports: 1024x1024, 1024x1792, 1792x1024
   */
  #mapSize(size?: string): string {
    const validSizes = ['1024x1024', '1024x1792', '1792x1024']

    // If 512x512 is requested (Leap default), upgrade to 1024x1024
    if (size === '512x512') {
      return '1024x1024'
    }

    // If size is valid, use it
    if (size && validSizes.includes(size)) {
      return size
    }

    // Default to square
    return '1024x1024'
  }
}
