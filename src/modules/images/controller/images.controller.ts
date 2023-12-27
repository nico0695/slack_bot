import { Router } from 'express'

import ImagesServices from '../services/images.services'

export default class ImagessController {
  static #instance: ImagessController

  public router: Router

  #imagesServices: ImagesServices

  private constructor() {
    this.#imagesServices = ImagesServices.getInstance()

    this.generateImages = this.generateImages.bind(this)
  }

  static getInstance(): ImagessController {
    if (this.#instance) {
      return this.#instance
    }

    this.#instance = new ImagessController()
    return this.#instance
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

      const newResponse = await this.#imagesServices.generateImages(prompt, userData, say)

      say(newResponse)
    } catch (error) {
      console.log('err= ', error)
    }
  }
}
