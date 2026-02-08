import { GoogleGenAI } from '@google/genai'
import { createModuleLogger } from '../../../../config/logger'
import {
  IImageRepository,
  IImageGenerationOptions,
  IImageGenerationResponse,
  ImageProvider,
} from '../../shared/interfaces/images.interfaces'

const log = createModuleLogger('gemini.images')

/**
 * Google Gemini Imagen 3 Image Generation Repository
 * Implements IImageRepository interface following the same pattern as conversations module
 *
 * Uses @google/genai library (same as GeminiRepository in conversations)
 * Imagen 3 excels at photorealistic images and artistic styles
 */
export default class GeminiImagesRepository implements IImageRepository {
  private static instance: GeminiImagesRepository

  private geminiApi: any

  private constructor() {
    this.geminiApi = this.initializeGeminiApi()
    this.generateImage = this.generateImage.bind(this)
  }

  static getInstance(): GeminiImagesRepository {
    if (this.instance) {
      return this.instance
    }

    this.instance = new GeminiImagesRepository()
    return this.instance
  }

  /**
   * Initialize Gemini API client
   * Follows the same pattern as GeminiRepository in conversations module
   */
  private initializeGeminiApi(): any {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined in the environment variables.')
    }

    return new GoogleGenAI({
      apiKey,
    })
  }

  /**
   * Generate image using Imagen 3 (IImageRepository interface implementation)
   * Imagen 3 is synchronous - no polling required
   *
   * @param prompt - Text description of the image to generate
   * @param options - Generation options (number of images, etc.)
   * @returns Unified response with generated images or null on error
   */
  async generateImage(
    prompt: string,
    options?: IImageGenerationOptions
  ): Promise<IImageGenerationResponse | null> {
    try {
      const numberOfImages = options?.numberOfImages || 1

      // Call Imagen 3 API
      const response = await this.geminiApi.models.generateImages({
        model: 'imagen-3.0-generate-002',
        prompt,
        numberOfImages,
      })

      // Validate response
      if (!response?.images || response.images.length === 0) {
        log.warn('Gemini Images API returned no images')
        return null
      }

      // Map response to unified format
      return {
        images: response.images.map((img: any, index: number) => ({
          url: img.imageUrl || img.url || img.uri,
          id: `gemini-${Date.now()}-${index}`,
          createdAt: new Date().toISOString(),
        })),
        provider: ImageProvider.GEMINI,
      }
    } catch (error: any) {
      if (error.message?.includes('429') || error.status === 429) {
        log.warn('Gemini Images API rate limit exceeded')
      } else {
        log.error({ err: error }, 'Gemini Images API generateImage failed')
      }
      return null
    }
  }
}
