import axios from 'axios'
import { createModuleLogger } from '../../../../config/logger'
import {
  IGenerateImageResponse,
  IInferaceJobResponse,
  IImageRepository,
  IImageGenerationOptions,
  IImageGenerationResponse,
  ImageProvider,
} from '../../shared/interfaces/images.interfaces'
import { LeapStatus } from '../../shared/constants/leap'

const log = createModuleLogger('leap.images')

/**
 * Leap API Image Generation Repository
 * Implements IImageRepository interface following the same pattern as conversations module
 */
export default class LeapRepository implements IImageRepository {
  private static instance: LeapRepository

  private header

  private modelId = 'eab32df0-de26-4b83-a908-a83f3015e971'

  private constructor() {
    this.generateImage = this.generateImage.bind(this)

    this.header = {
      accept: 'application/json',
      'Content-Type': 'application/json',
      authorization: `Bearer ${process.env.LEAP_API_KEY}`,
    }
  }

  static getInstance(): LeapRepository {
    if (this.instance) {
      return this.instance
    }

    this.instance = new LeapRepository()
    return this.instance
  }

  /**
   * Generate image using Leap API (IImageRepository interface implementation)
   * Handles the entire flow: initial request + polling until completion
   *
   * @param prompt - Text description of the image to generate
   * @param options - Generation options (size, quality, etc.)
   * @returns Unified response with generated images or null on error
   */
  async generateImage(
    prompt: string,
    options?: IImageGenerationOptions
  ): Promise<IImageGenerationResponse | null> {
    try {
      // Step 1: Call Leap API to start image generation
      const initialResponse = await this.callGenerateImage(prompt, options)
      if (!initialResponse) {
        return null
      }

      // Step 2: Poll until the job is finished
      const finalResponse = await this.pollUntilComplete(initialResponse.inferenceId)
      if (!finalResponse?.images || finalResponse.images.length === 0) {
        return null
      }

      // Step 3: Return in unified format
      return {
        images: finalResponse.images.map((img) => ({
          url: img.uri,
          id: img.id,
          createdAt: img.createdAt,
        })),
        provider: ImageProvider.LEAP,
        inferenceId: initialResponse.inferenceId,
      }
    } catch (error) {
      log.error({ err: error }, 'generateImage failed')
      return null
    }
  }

  /**
   * Call Leap API to start image generation (private method)
   * Returns inference ID for polling
   */
  private callGenerateImage = async (
    prompt: string,
    options?: IImageGenerationOptions
  ): Promise<IGenerateImageResponse | null> => {
    try {
      // Map options to Leap API parameters
      const size = options?.size === '1024x1024' ? 1024 : 512
      const numberOfImages = options?.numberOfImages || 1

      const payload = {
        prompt,
        steps: 50,
        width: size,
        height: size,
        numberOfImages,
        promptStrength: 7,
        enhancePrompt: false,
        restoreFaces: true,
        upscaleBy: 'x1',
      }

      const response = await axios.post(
        `https://api.tryleap.ai/api/v1/images/models/${this.modelId}/inferences`,
        payload,
        {
          headers: this.header,
        }
      )

      return {
        inferenceId: response.data.id,
        status: response.data.status,
      }
    } catch (error) {
      log.error({ err: error }, 'callGenerateImage failed')
      return null
    }
  }

  /**
   * Poll Leap API until image generation is complete
   * Extracted from ImagesServices to keep polling logic in repository
   */
  private pollUntilComplete = async (inferenceId: string): Promise<IInferaceJobResponse | null> => {
    try {
      let status = LeapStatus.queued
      let result: IInferaceJobResponse | null = null

      // Poll until finished
      while (status !== LeapStatus.finished) {
        const jobResponse = await this.getInferenceJobPrivate(inferenceId)
        if (!jobResponse) {
          return null
        }

        status = jobResponse.state

        if (status === LeapStatus.finished) {
          result = jobResponse
        }

        // Small delay to avoid hammering the API
        if (status !== LeapStatus.finished) {
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
      }

      return result
    } catch (error) {
      log.error({ err: error }, 'pollUntilComplete failed')
      return null
    }
  }

  /**
   * Ask for inference status and images by inference ID (private method)
   */
  private getInferenceJobPrivate = async (inferenceId: string): Promise<IInferaceJobResponse | null> => {
    try {
      const url = `https://api.tryleap.ai/api/v1/images/models/${this.modelId}/inferences/${inferenceId}`

      const response = await axios.get(url, {
        headers: this.header,
      })

      return {
        state: response.data.state,
        images: response.data.images ?? undefined,
      }
    } catch (error) {
      log.error({ err: error }, 'getInferenceJob failed')
      return null
    }
  }

  // ===============================================
  // Legacy methods (kept for backward compatibility if needed)
  // Will be removed once ImagesServices is refactored
  // ===============================================

  /**
   * @deprecated Use generateImage() instead (implements IImageRepository)
   * Legacy method - kept for backward compatibility during migration
   */
  legacyGenerateImage = async (prompt: string): Promise<IGenerateImageResponse | null> => {
    return await this.callGenerateImage(prompt)
  }

  /**
   * @deprecated Will be removed once ImagesServices is refactored
   * Legacy method - kept for backward compatibility during migration
   */
  getInterfaceJob = async (inferenceId: string): Promise<IInferaceJobResponse> => {
    return await this.getInferenceJobPrivate(inferenceId)
  }
}
