import LeapRepository from '../repositories/leap/leap.repository'
import ImagesDataSources from '../repositories/database/images.dataSource'
import { LeapStatus } from '../shared/constants/leap'
import {
  IImage,
  IInferaceJobResponse,
  ILeapImages,
  IUserData,
} from '../shared/interfaces/images.interfaces'
import { IPaginationOptions, IPaginationResponse } from '../../../shared/interfaces/pagination'
import { GenericResponse } from '../../../shared/interfaces/services'
import { Images } from '../../../entities/images'

export default class ImagesServices {
  static #instance: ImagesServices

  #leapRepository: LeapRepository
  #imagesDataSources: ImagesDataSources

  private constructor() {
    this.#leapRepository = LeapRepository.getInstance()
    this.#imagesDataSources = ImagesDataSources.getInstance()

    this.generateImages = this.generateImages.bind(this)
  }

  static getInstance(): ImagesServices {
    if (this.#instance) {
      return this.#instance
    }

    this.#instance = new ImagesServices()
    return this.#instance
  }

  #storeUserImages = async (
    userData: IUserData,
    image: ILeapImages,
    prompt?: string
  ): Promise<void> => {
    const imageData: IImage = {
      imageUrl: image.uri,
      inferenceId: image.id,
      slackId: userData.slackId,
      slackTeamId: userData.slackTeamId,
      username: userData.username,
      prompt,
    }

    await this.#imagesDataSources.createImages(imageData)
  }

  generateImages = async (
    prompt: string,
    userData: IUserData,
    say: (message: string) => void
  ): Promise<string> => {
    try {
      // Generate image and get inference id
      const inference = await this.#leapRepository.generateImage(prompt)

      say('Generando imagen...')

      let status = inference?.status

      let returnValue: IInferaceJobResponse = null

      // Wait until inference is finished
      while (status !== LeapStatus.finished) {
        // ask for inference status and image generated
        const inferaceJob: IInferaceJobResponse = await this.#leapRepository.getInterfaceJob(
          inference?.inferenceId
        )

        status = inferaceJob.state

        if (status === LeapStatus.finished) {
          returnValue = inferaceJob
        }
      }

      if (returnValue !== null && returnValue.images.length > 0) {
        // Save images
        await Promise.all(
          returnValue.images.map(async (image: ILeapImages) => {
            await this.#storeUserImages(userData, image, prompt)
          })
        )

        return returnValue.images
          .map((image: ILeapImages, index: number) => `Imagen #${index + 1}: ${image.uri}`)
          .join('\n')
      }

      return 'No se pudo generar la imagen'
    } catch (error) {
      console.log('error= ', error.message)
      return 'No se pudo generar la imagen'
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
      console.log('error= ', error.message)
      return { error: 'Error al obtener las imagenes' }
    }
  }
}
