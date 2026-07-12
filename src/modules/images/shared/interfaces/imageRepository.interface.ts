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
   * - gpt-image-1: supports 1024x1024, 1536x1024, 1024x1536
   * - Imagen 3: supports various sizes
   * - Legacy sizes (1024x1792, 1792x1024, 512x512) are accepted and mapped by each repository
   */
  size?: '1024x1024' | '1536x1024' | '1024x1536' | '1024x1792' | '1792x1024' | '512x512'

  /**
   * Image quality (mainly for gpt-image-1)
   * - low / medium / high / auto: native gpt-image-1 values
   * - standard / hd: legacy DALL-E 3 values, mapped by the repository (standard→medium, hd→high)
   */
  quality?: 'low' | 'medium' | 'high' | 'auto' | 'standard' | 'hd'

  /**
   * Number of images to generate
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
   * URL of the generated image (providers that return a hosted URL)
   */
  url?: string

  /**
   * Base64-encoded image data (providers like gpt-image-1 that return b64_json instead of a URL)
   */
  b64?: string

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
   * @param options - Optional generation parameters (size, quality, etc.)
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
