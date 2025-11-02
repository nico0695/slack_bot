import { GoogleGenAI } from '@google/genai'
import {
  IImageRepository,
  IImageGenerationOptions,
  IImageGenerationResponse,
  ImageProvider,
} from '../../shared/interfaces/images.interfaces'

/**
 * Google Gemini Imagen 3 Image Generation Repository
 * Implements IImageRepository interface following the same pattern as conversations module
 *
 * Uses @google/genai library (same as GeminiRepository in conversations)
 * Imagen 3 excels at photorealistic images and artistic styles
 */
export default class GeminiImagesRepository implements IImageRepository {
  static #instance: GeminiImagesRepository

  #geminiApi: any

  private constructor() {
    this.#geminiApi = this.#initializeGeminiApi()
    this.generateImage = this.generateImage.bind(this)
  }

  static getInstance(): GeminiImagesRepository {
    if (this.#instance) {
      return this.#instance
    }

    this.#instance = new GeminiImagesRepository()
    return this.#instance
  }

  /**
   * Initialize Gemini API client
   * Follows the same pattern as GeminiRepository in conversations module
   */
  #initializeGeminiApi(): any {
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
      const response = await this.#geminiApi.models.generateImages({
        model: 'imagen-3.0-generate-002',
        prompt,
        numberOfImages,
      })

      // Validate response
      if (!response?.images || response.images.length === 0) {
        console.error('Gemini Images API returned no images')
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
        console.error('Gemini API rate limit exceeded. Please try again later.')
      } else if (error.response?.data?.error) {
        console.error('Gemini Images API error:', error.response.data.error.message)
      } else {
        console.error('Gemini Images API error:', error.message)
      }
      return null
    }
  }
}
