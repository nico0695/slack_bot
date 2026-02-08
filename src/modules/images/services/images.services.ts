import { createModuleLogger } from '../../../config/logger'
import ImagesDataSources from '../repositories/database/images.dataSource'
import {
  IImage,
  IUserData,
  IImageRepository,
} from '../shared/interfaces/images.interfaces'
import {
  IImageGenerationOptions,
  IImageGenerationResponse,
} from '../shared/interfaces/imageRepository.interface'
import { IPaginationOptions, IPaginationResponse } from '../../../shared/interfaces/pagination'
import { GenericResponse } from '../../../shared/interfaces/services'
import { Images } from '../../../entities/images'
import {
  ImageRepositoryType,
  ImageRepositoryByType,
  getDefaultImageRepositoryType,
} from '../shared/constants/imageRepository'
import UsersServices from '../../users/services/users.services'
import ExternalStorageServices from '../../externalStorage/services/externalStorage.services'
import { StorageSourceModule } from '../../externalStorage/shared/constants/externalStorage.constants'

const log = createModuleLogger('images.service')

/**
 * Images Service
 * Handles business logic for image generation using repository abstraction
 * Follows the same pattern as ConversationsServices (AIRepositoryType pattern)
 */
export default class ImagesServices {
  static #instance: ImagesServices

  #imageRepository: IImageRepository // Interface, not concrete class
  #imagesDataSources: ImagesDataSources
  #externalStorageServices: ExternalStorageServices

  private constructor(repositoryType: ImageRepositoryType = getDefaultImageRepositoryType()) {
    // Factory pattern: select repository based on type
    this.#imageRepository = ImageRepositoryByType[repositoryType].getInstance()
    this.#imagesDataSources = ImagesDataSources.getInstance()
    this.#externalStorageServices = ExternalStorageServices.getInstance()

    this.generateImages = this.generateImages.bind(this)
  }

  static getInstance(repositoryType?: ImageRepositoryType): ImagesServices {
    if (this.#instance) {
      return this.#instance
    }

    this.#instance = new ImagesServices(repositoryType)
    return this.#instance
  }

  /**
   * Store generated image in database
   * Refactored to accept generic image data instead of Leap-specific types
   */
  #storeUserImages = async (imageData: IImage): Promise<void> => {
    await this.#imagesDataSources.createImages(imageData)
  }

  /**
   * Upload a generated image to external storage (api-storage / Backblaze B2)
   * Downloads the temporary provider URL and re-uploads for persistent storage
   */
  #uploadImageToStorage = async (
    imageUrl: string,
    prompt: string,
    provider: string,
    userData: { slackId: string },
    options?: { size?: string; quality?: string; style?: string }
  ): Promise<{ storageUrl: string; storageFileId: string }> => {
    const fileName = `img_${Date.now()}.png`

    const metadata: Record<string, string> = {
      prompt,
      provider,
      slackId: userData.slackId,
    }
    if (options?.size) metadata.size = options.size
    if (options?.quality) metadata.quality = options.quality
    if (options?.style) metadata.style = options.style

    const result = await this.#externalStorageServices.uploadFromUrl({
      sourceUrl: imageUrl,
      fileName,
      sourceModule: StorageSourceModule.IMAGES,
      mimeType: 'image/png',
      metadata,
    })

    if (result.error) {
      throw new Error(result.error)
    }

    const detailsResult = await this.#externalStorageServices.getFileDetails(result.data.localId)

    if (detailsResult.error) {
      throw new Error(detailsResult.error)
    }

    return {
      storageUrl: detailsResult.data.downloadUrl,
      storageFileId: result.data.storageFileId,
    }
  }

  /**
   * Generate images using the configured repository
   * Simplified: repository now handles polling and returns complete response
   *
   * @param prompt - Text description of the image to generate
   * @param userData - User information for tracking
   * @param say - Slack say function for sending messages
   * @returns Formatted string with image URLs or error message
   */
  generateImages = async (
    prompt: string,
    userData: IUserData,
    say: (message: string) => void
  ): Promise<string> => {
    try {
      // Notify user that generation started
      say('Generando imagen...')

      const startTime = Date.now()

      // Call repository - it handles all the polling logic now
      const response = await this.#imageRepository.generateImage(prompt, {
        size: '1024x1024',
        quality: 'standard',
      })

      // Check if generation was successful
      if (!response?.images?.length) {
        return 'No se pudo generar la imagen'
      }

      // Upload images to persistent storage and save to database
      const storageUrls: string[] = []
      await Promise.all(
        response.images.map(async (image) => {
          const uploaded = await this.#uploadImageToStorage(
            image.url,
            prompt,
            response.provider,
            { slackId: userData.slackId },
            { size: '1024x1024', quality: 'standard' }
          )

          storageUrls.push(uploaded.storageUrl)

          const imageData: IImage = {
            imageUrl: uploaded.storageUrl,
            inferenceId: response.inferenceId || image.id || 'unknown',
            slackId: userData.slackId,
            slackTeamId: userData.slackTeamId,
            username: userData.username,
            prompt,
          }
          await this.#storeUserImages(imageData)
        })
      )

      const durationMs = Date.now() - startTime

      log.info({ durationMs, provider: response.provider, imageCount: response.images.length }, 'Image generation completed')

      // Format response with persistent storage URLs
      const imageUrlsText = storageUrls
        .map((url, index) => `Imagen #${index + 1}: ${url}`)
        .join('\n')

      return `Imágenes generadas con ${response.provider}:\n${imageUrlsText}`
    } catch (error) {
      log.error({ err: error }, 'generateImages failed')
      return 'No se pudo generar la imagen'
    }
  }

  /**
   * Generate images for assistant (returns response object instead of formatted string)
   *
   * @param prompt - Text description of the image to generate
   * @param userId - User ID for tracking
   * @param options - Image generation options (size, quality, style, numberOfImages)
   * @returns Image generation response with images array and provider info
   */
  generateImageForAssistant = async (
    prompt: string,
    userId: number,
    options?: IImageGenerationOptions
  ): Promise<IImageGenerationResponse | null> => {
    try {
      // Generate image using repository
      const response = await this.#imageRepository.generateImage(prompt, options)

      if (!response?.images?.length) {
        return null
      }

      // Get user info for database storage
      const userService = UsersServices.getInstance()
      const user = await userService.getUserById(userId)

      if (!user?.data) {
        log.warn({ userId }, 'User not found for image storage')
        return response // Return images but don't store
      }

      // Upload images to persistent storage and save to database
      await Promise.all(
        response.images.map(async (image) => {
          const uploaded = await this.#uploadImageToStorage(
            image.url,
            prompt,
            response.provider,
            { slackId: user.data.slackId },
            options
          )

          image.url = uploaded.storageUrl

          const imageData: IImage = {
            imageUrl: uploaded.storageUrl,
            inferenceId: response.inferenceId || image.id || 'unknown',
            slackId: user.data.slackId,
            slackTeamId: user.data.slackTeamId,
            username: user.data.name,
            prompt,
          }
          await this.#storeUserImages(imageData)
        })
      )

      return response
    } catch (error) {
      log.error({ err: error }, 'generateImageForAssistant failed')
      return null
    }
  }

  getImages = async (
    page: number,
    pageSize: number
  ): Promise<GenericResponse<IPaginationResponse<Images>>> => {
    try {
      const options: IPaginationOptions = {
        page,
        pageSize,
      }

      const images = await this.#imagesDataSources.getAllImages(options)

      return { data: images }
    } catch (error) {
      log.error({ err: error }, 'getImages failed')
      return { error: 'Error al obtener las imagenes' }
    }
  }
}
