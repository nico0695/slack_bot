import { Router } from 'express'
import { injectable } from 'tsyringe'

import BadRequestError from '../../../shared/utils/errors/BadRequestError'
import { validateQuery, paginationSchema } from '../../../shared/utils/validation'

import { HttpAuth } from '../../../shared/middleware/auth'

import ImagesServices from '../services/images.services'

@injectable()
export default class ImagesWebController {
  public router: Router

  private imagesServices: ImagesServices

  constructor(imagesServices: ImagesServices) {
    this.getImages = this.getImages.bind(this)

    this.imagesServices = imagesServices

    this.router = Router()
    this.registerRoutes()
  }

  protected registerRoutes(): void {
    this.router.get('/get-images', this.getImages)
  }

  // ROUTES

  @HttpAuth
  public async getImages(req: any, res: any): Promise<void> {
    const { page, pageSize } = validateQuery(paginationSchema, req.query)

    const response = await this.imagesServices.getImages(page, pageSize)

    if (response.error) {
      throw new BadRequestError({ message: 'Error al obtener las imagenes' })
    }

    res.status(200).send(response.data)
  }
}
