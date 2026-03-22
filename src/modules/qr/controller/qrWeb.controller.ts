import { Router } from 'express'
import GenericController from '../../../shared/modules/genericController'
import BadRequestError from '../../../shared/utils/errors/BadRequestError'
import { validateBody } from '../../../shared/utils/validation'
import QrServices from '../services/qr.services'
import { qrSchema } from '../shared/schemas/qr.schemas'
import { HttpAuth, Permission } from '../../../shared/middleware/auth'
import { Profiles } from '../../../shared/constants/auth.constants'

export default class QrWebController extends GenericController {
  private static instance: QrWebController
  public router: Router
  private qrServices: QrServices

  private constructor() {
    super()
    this.generateQr = this.generateQr.bind(this)

    this.qrServices = QrServices.getInstance()
    this.router = Router()
    this.registerRoutes()
  }

  static getInstance(): QrWebController {
    if (this.instance) {
      return this.instance
    }
    this.instance = new QrWebController()
    return this.instance
  }

  protected registerRoutes(): void {
    this.router.post('/', this.generateQr)
  }

  @HttpAuth
  @Permission([Profiles.USER, Profiles.USER_PREMIUM, Profiles.ADMIN])
  public async generateQr(req: any, res: any): Promise<void> {
    const parsed = validateBody(qrSchema, req.body)

    const response = await this.qrServices.generateQrCode(parsed.content)

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.send(response.data)
  }
}
