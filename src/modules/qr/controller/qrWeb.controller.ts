import { injectable } from 'tsyringe'
import { Router } from 'express'
import GenericController from '../../../shared/modules/genericController'
import BadRequestError from '../../../shared/utils/errors/BadRequestError'
import { validateBody } from '../../../shared/utils/validation'
import QrServices from '../services/qr.services'
import { qrSchema } from '../shared/schemas/qr.schemas'
import { HttpAuth, Permission } from '../../../shared/middleware/auth'
import { Profiles } from '../../../shared/constants/auth.constants'

@injectable()
export default class QrWebController extends GenericController {
  public router: Router

  constructor(private qrServices: QrServices) {
    super()
    this.generate = this.generate.bind(this)
    this.router = Router()
    this.registerRoutes()
  }

  protected registerRoutes(): void {
    this.router.post('/', this.generate)
  }

  @HttpAuth
  @Permission([Profiles.USER, Profiles.USER_PREMIUM, Profiles.ADMIN])
  public async generate(req: any, res: any): Promise<void> {
    const parsed = validateBody(qrSchema, req.body)

    const response = await this.qrServices.generateQr(parsed.text)

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.send(response.data)
  }
}
