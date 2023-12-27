import { Images } from '../../../../entities/images'

import { IImage } from '../../shared/interfaces/images.interfaces'
import { IPaginationOptions, IPaginationResponse } from '../../../../shared/interfaces/pagination'

export default class ImagesDataSources {
  static #instance: ImagesDataSources

  private constructor() {}

  static getInstance(): ImagesDataSources {
    if (this.#instance) {
      return this.#instance
    }

    this.#instance = new ImagesDataSources()
    return this.#instance
  }

  /**
   * Save user in database
   * @param data IImage - Data image
   * @returns
   */
  public async createImages(data: IImage): Promise<Images> {
    try {
      const newImage = new Images()
      newImage.imageUrl = data.imageUrl
      newImage.inferenceId = data.inferenceId
      newImage.username = data.username
      newImage.slackTeamId = data.slackTeamId
      newImage.slackId = data.slackId
      newImage.prompt = data.prompt

      await newImage.save()

      return newImage
    } catch (error) {
      return error
    }
  }

  /**
   * Get images by username
   * @param username string - Username
   * @returns Images[]
   */
  public async getImagesByUsername(username: string): Promise<Images[]> {
    try {
      const images = await Images.find({
        where: {
          username,
        },
      })

      return images
    } catch (error) {
      return error
    }
  }

  /**
   * Get all images with pagination
   * @param page number - Page
   * @param pageSize number - Limit
   * @returns Images[]
   */
  public async getAllImages(options: IPaginationOptions): Promise<IPaginationResponse<Images>> {
    const response = new IPaginationResponse<Images>(options)

    const skip = (options.page - 1) * options.pageSize

    try {
      const images = await Images.findAndCount({
        skip: skip > 0 ? skip : 0,
        take: options.pageSize,
      })

      response.setData(images[0], images[1])

      return response
    } catch (error) {
      return error
    }
  }
}
