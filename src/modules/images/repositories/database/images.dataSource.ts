import { Images } from '../../../../entities/images'

import { IImage } from '../../shared/interfaces/images.interfaces'

export default class ImagesDataSources {
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

      await newImage.save()

      return newImage
    } catch (error) {
      return error
    }
  }
}
