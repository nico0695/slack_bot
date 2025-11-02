/**
 * Common interface for all image generation repositories
 * Follows the same pattern as conversations module (OpenAI/Gemini repositories)
 */

/**
 * Provider enum for tracking which service generated the image
 */
export enum ImageProvider {
  LEAP = 'leap',
  OPENAI = 'openai',
  GEMINI = 'gemini',
}

/**
 * Options for image generation - can be extended by specific providers
 */
export interface IImageGenerationOptions {
  /**
   * Image dimensions
   * - DALL-E 3: supports 1024x1024, 1024x1792, 1792x1024
   * - Imagen 3: supports various sizes
   * - Leap: supports 512x512, 1024x1024
   */
  size?: '1024x1024' | '1024x1792' | '1792x1024' | '512x512'

  /**
   * Image quality (mainly for DALL-E 3)
   * - standard: faster, lower cost
   * - hd: higher quality, more time, higher cost
   */
  quality?: 'standard' | 'hd'

  /**
   * Style of the generated image (mainly for DALL-E 3)
   * - vivid: hyper-real and dramatic
   * - natural: more natural, less hyper-real
   */
  style?: 'vivid' | 'natural'

  /**
   * Number of images to generate
   * Note: DALL-E 3 only supports 1
   */
  numberOfImages?: number

  /**
   * Additional provider-specific options can be added by extending this interface
   */
  [key: string]: any
}

/**
 * Single generated image information
 */
export interface IGeneratedImage {
  /**
   * URL of the generated image
   */
  url: string

  /**
   * Unique identifier for this image (provider-specific)
   */
  id?: string

  /**
   * Timestamp when the image was created
   */
  createdAt?: string
}

/**
 * Unified response from image generation
 */
export interface IImageGenerationResponse {
  /**
   * Array of generated images
   */
  images: IGeneratedImage[]

  /**
   * Provider that generated the images
   */
  provider: ImageProvider

  /**
   * Inference/job ID (optional, for providers that use async processing)
   */
  inferenceId?: string
}

/**
 * Common interface that all image repositories must implement
 * Similar to the implicit contract in conversations module
 */
export interface IImageRepository {
  /**
   * Generates one or more images based on a text prompt
   *
   * @param prompt - Text description of the image to generate
   * @param options - Optional generation parameters (size, quality, style, etc.)
   * @returns Promise with generation response or null on error
   *
   * Error Handling:
   * - Returns null on any error (following conversations pattern)
   * - Logs errors to console
   * - Handles rate limiting gracefully
   */
  generateImage: (
    prompt: string,
    options?: IImageGenerationOptions
  ) => Promise<IImageGenerationResponse | null>
}
