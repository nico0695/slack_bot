import { injectable, inject } from 'tsyringe'
import { createModuleLogger } from '../../../config/logger'
import ImagesDataSources from '../repositories/database/images.dataSource'
import { IImage, IUserData, IImageRepository } from '../shared/interfaces/images.interfaces'
import {
  IImageGenerationOptions,
  IImageGenerationResponse,
} from '../shared/interfaces/imageRepository.interface'
import { IPaginationOptions, IPaginationResponse } from '../../../shared/interfaces/pagination'
import { GenericResponse } from '../../../shared/interfaces/services'
import { Images } from '../../../entities/images'
import UsersServices from '../../users/services/users.services'
import ExternalStorageServices from '../../externalStorage/services/externalStorage.services'
import { StorageSourceModule } from '../../externalStorage/shared/constants/externalStorage.constants'

const log = createModuleLogger('images.service')

/**
 * Images Service
 * Handles business logic for image generation using repository abstraction
 * Follows the same pattern as ConversationsServices (AIRepositoryType pattern)
 */
@injectable()
export default class ImagesServices {
  constructor(
    @inject('ImageRepository') private imageRepository: IImageRepository,
    private imagesDataSources: ImagesDataSources,
    private externalStorageServices: ExternalStorageServices,
    private usersServices: UsersServices
  ) {
    this.generateImages = this.generateImages.bind(this)
  }

  /**
   * Store generated image in database
   * Refactored to accept generic image data instead of Leap-specific types
   */
  private storeUserImages = async (imageData: IImage): Promise<void> => {
    await this.imagesDataSources.createImages(imageData)
  }

  /**
   * Upload a generated image to external storage (api-storage / Backblaze B2)
   * Downloads the temporary provider URL and re-uploads for persistent storage
   */
  private uploadImageToStorage = async (
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

    const result = await this.externalStorageServices.uploadFromUrl({
      sourceUrl: imageUrl,
      fileName,
      sourceModule: StorageSourceModule.IMAGES,
      mimeType: 'image/png',
      metadata,
    })

    if (result.error) {
      throw new Error(result.error)
    }

    const detailsResult = await this.externalStorageServices.getFileDetails(result.data.localId)

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
      say('Generando imagen...')

      const startTime = Date.now()

      const response = await this.imageRepository.generateImage(prompt, {
        size: '1024x1024',
        quality: 'standard',
      })

      if (!response?.images?.length) {
        return 'No se pudo generar la imagen'
      }

      const storageUrls: string[] = []
      await Promise.all(
        response.images.map(async (image) => {
          const uploaded = await this.uploadImageToStorage(
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
          await this.storeUserImages(imageData)
        })
      )

      const durationMs = Date.now() - startTime

      log.info(
        { durationMs, provider: response.provider, imageCount: response.images.length },
        'Image generation completed'
      )

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
      const response = await this.imageRepository.generateImage(prompt, options)

      if (!response?.images?.length) {
        return null
      }

      const user = await this.usersServices.getUserById(userId)

      if (!user?.data) {
        log.warn({ userId }, 'User not found for image storage')
        return response // Return images but don't store
      }

      await Promise.all(
        response.images.map(async (image) => {
          const uploaded = await this.uploadImageToStorage(
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
          await this.storeUserImages(imageData)
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

      const images = await this.imagesDataSources.getAllImages(options)

      return { data: images }
    } catch (error) {
      log.error({ err: error }, 'getImages failed')
      return { error: 'Error al obtener las imagenes' }
    }
  }
}
