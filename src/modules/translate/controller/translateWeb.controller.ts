import { Router } from 'express'
import GenericController from '../../../shared/modules/genericController'
import BadRequestError from '../../../shared/utils/errors/BadRequestError'
import { validateBody } from '../../../shared/utils/validation'
import TranslateServices from '../services/translate.services'
import { translateSchema } from '../shared/schemas/translate.schemas'
import { HttpAuth, Permission } from '../../../shared/middleware/auth'
import { Profiles } from '../../../shared/constants/auth.constants'

export default class TranslateWebController extends GenericController {
  private static instance: TranslateWebController
  public router: Router
  private translateServices: TranslateServices

  private constructor() {
    super()
    this.translate = this.translate.bind(this)

    this.translateServices = TranslateServices.getInstance()
    this.router = Router()
    this.registerRoutes()
  }

  static getInstance(): TranslateWebController {
    if (this.instance) {
      return this.instance
    }
    this.instance = new TranslateWebController()
    return this.instance
  }

  protected registerRoutes(): void {
    this.router.post('/', this.translate)
  }

  @HttpAuth
  @Permission([Profiles.USER, Profiles.USER_PREMIUM, Profiles.ADMIN])
  public async translate(req: any, res: any): Promise<void> {
    const parsed = validateBody(translateSchema, req.body)

    const response = await this.translateServices.translate(parsed.text, parsed.targetLang)

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.send(response.data)
  }
}
