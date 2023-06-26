import { Router } from 'express'

import ImagessServices from '../services/images.services'

export default class ImagessController {
  public router: Router

  #imagesServices: ImagessServices

  constructor() {
    this.#imagesServices = new ImagessServices()

    this.generateImages = this.generateImages.bind(this)
  }

  /** Images Controllers Methods */

  /**
   *
   * @param data slack response
   */
  public generateImages = async (data: any): Promise<void> => {
    const { payload, say }: any = data

    try {
      const prompt: string = payload.text.replace('img ', '').trimStart()

      const newResponse = await this.#imagesServices.generateImages(prompt, say)

      say(newResponse)
    } catch (error) {
      console.log('err= ', error)
    }
  }
}
