import { Router } from 'express'
import { injectable } from 'tsyringe'

import { createModuleLogger } from '../../../config/logger'
import ImagesServices from '../services/images.services'

const log = createModuleLogger('images.controller')

@injectable()
export default class ImagessController {
  public router: Router

  private imagesServices: ImagesServices

  constructor(imagesServices: ImagesServices) {
    this.imagesServices = imagesServices

    this.generateImages = this.generateImages.bind(this)
  }

  /** Images Controllers Methods */

  /**
   *
   * @param data slack response
   */
  public generateImages = async (data: any): Promise<void> => {
    const { payload, say, body }: any = data

    try {
      const prompt: string = payload.text.replace('img ', '').trimStart()

      const userData = {
        slackId: payload.user,
        slackTeamId: body.team_id,
        username: '',
      }

      const newResponse = await this.imagesServices.generateImages(prompt, userData, say)

      say(newResponse)
    } catch (error) {
      log.error({ err: error }, 'generateImages failed')
    }
  }
}
