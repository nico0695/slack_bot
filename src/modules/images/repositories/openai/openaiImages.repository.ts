import axios from 'axios'
import { singleton } from 'tsyringe'
import { createModuleLogger } from '../../../../config/logger'
import {
  IImageRepository,
  IImageGenerationOptions,
  IImageGenerationResponse,
  ImageProvider,
} from '../../shared/interfaces/images.interfaces'

const log = createModuleLogger('openai.images')

/**
 * OpenAI gpt-image-1 Image Generation Repository
 * Implements IImageRepository interface following the same pattern as conversations module
 *
 * Uses REST API via axios (similar to LeapRepository) to maintain consistency
 * and avoid breaking changes in the legacy openai v3.2.1 package used by conversations
 *
 * gpt-image-1 returns images as base64 (b64_json) — there is no hosted URL in the response
 */
@singleton()
export default class OpenaiImagesRepository implements IImageRepository {
  private apiKey: string
  private baseUrl = 'https://api.openai.com/v1'

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not defined in the environment variables.')
    }

    this.apiKey = apiKey
    this.generateImage = this.generateImage.bind(this)
  }

  /**
   * Generate image using gpt-image-1 (IImageRepository interface implementation)
   * gpt-image-1 is synchronous - no polling required
   *
   * @param prompt - Text description of the image to generate
   * @param options - Generation options (size, quality, numberOfImages)
   * @returns Unified response with generated images (base64) or null on error
   */
  async generateImage(
    prompt: string,
    options?: IImageGenerationOptions
  ): Promise<IImageGenerationResponse | null> {
    try {
      const size = this.mapSize(options?.size)
      const quality = this.mapQuality(options?.quality)
      const n = this.mapNumberOfImages(options?.numberOfImages)

      // gpt-image-1 does not accept response_format nor style — always returns b64_json
      const requestBody = {
        model: 'gpt-image-1',
        prompt,
        n,
        size,
        quality,
      }

      const response = await axios.post(`${this.baseUrl}/images/generations`, requestBody, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        // gpt-image-1 is slower than DALL-E 3, especially at high quality
        timeout: 120000,
      })

      const items = (response.data?.data || []).filter((img: any) => img.b64_json)

      if (items.length === 0) {
        return null
      }

      return {
        images: items.map((img: any, index: number) => ({
          b64: img.b64_json,
          id: `openai-${Date.now()}-${index}`,
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
   * Map generic size options to gpt-image-1 supported sizes
   * gpt-image-1 supports: 1024x1024, 1536x1024, 1024x1536
   * Legacy DALL-E 3 / Leap sizes are mapped to the closest equivalent
   */
  private mapSize(size?: string): string {
    const validSizes = ['1024x1024', '1536x1024', '1024x1536']

    const legacySizeMap: Record<string, string> = {
      '1024x1792': '1024x1536',
      '1792x1024': '1536x1024',
      '512x512': '1024x1024',
    }

    if (size && legacySizeMap[size]) {
      return legacySizeMap[size]
    }

    if (size && validSizes.includes(size)) {
      return size
    }

    return '1024x1024'
  }

  private mapQuality(quality?: string): string {
    const validQualities = ['low', 'medium', 'high', 'auto']

    const legacyQualityMap: Record<string, string> = {
      standard: 'medium',
      hd: 'high',
    }

    if (quality && legacyQualityMap[quality]) {
      return legacyQualityMap[quality]
    }

    if (quality && validQualities.includes(quality)) {
      return quality
    }

    return 'medium'
  }

  private mapNumberOfImages(numberOfImages?: number): number {
    if (!numberOfImages || numberOfImages < 1) {
      return 1
    }
    return Math.min(Math.floor(numberOfImages), 4)
  }
}
