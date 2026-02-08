import { Router } from 'express'

import BadRequestError from '../../../shared/utils/errors/BadRequestError'

import { HttpAuth } from '../../../shared/middleware/auth'

import ImagesServices from '../services/images.services'

export default class ImagesWebController {
  private static instance: ImagesWebController

  public router: Router

  private imagesServices: ImagesServices

  private constructor() {
    this.getImages = this.getImages.bind(this)

    this.imagesServices = ImagesServices.getInstance()

    this.router = Router()
    this.registerRoutes()
  }

  static getInstance(): ImagesWebController {
    if (this.instance) {
      return this.instance
    }

    this.instance = new ImagesWebController()
    return this.instance
  }

  protected registerRoutes(): void {
    this.router.get('/get-images', this.getImages)
  }

  // ROUTES

  @HttpAuth
  public async getImages(req: any, res: any): Promise<void> {
    const {
      query: { page = 1, pageSize = 6 },
    } = req

    const pageInt = parseInt(page, 10)
    const sizeInt = parseInt(pageSize, 10)

    const response = await this.imagesServices.getImages(pageInt, sizeInt)

    if (response.error) {
      throw new BadRequestError({ message: 'Error al obtener las imagenes' })
    }

    res.status(200).send(response.data)
  }
}
