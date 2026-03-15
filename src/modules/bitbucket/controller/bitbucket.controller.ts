import { createModuleLogger } from '../../../config/logger'
import GenericController from '../../../shared/modules/genericController'
import UsersServices from '../../users/services/users.services'
import { SlackAuth } from '../../../shared/middleware/auth'
import { EMAIL_REGEX } from '../../../shared/constants/global'

const log = createModuleLogger('bitbucket.controller')

export default class BitbucketController extends GenericController {
  private static instance: BitbucketController

  private usersServices: UsersServices

  private constructor() {
    super()
    this.usersServices = UsersServices.getInstance()
    this.registerAtlassianEmail = this.registerAtlassianEmail.bind(this)
  }

  static getInstance(): BitbucketController {
    if (this.instance) {
      return this.instance
    }

    this.instance = new BitbucketController()
    return this.instance
  }

  /**
   * Handles `.bb me <email>` — registers the atlassianEmail for the calling user.
   */
  @SlackAuth
  public async registerAtlassianEmail(data: any): Promise<void> {
    const { payload, say }: any = data

    try {
      const text: string = payload.text ?? ''
      const parts = text.trim().split(/\s+/)
      // Expected format: ".bb me <email>"
      const email = parts[2]

      if (!email || !EMAIL_REGEX.test(email)) {
        say(
          'Por favor indicá un email válido. Uso: `.bb me tu@empresa.com` 📧'
        )
        return
      }

      const userData = this.userData

      if (!userData?.id) {
        say('Ups! No se pudo obtener tu información 🤷‍♂️')
        return
      }

      const response = await this.usersServices.updateUserById(userData.id, {
        atlassianEmail: email,
      })

      if (response.error) {
        log.error({ err: response.error, userId: userData.id }, 'registerAtlassianEmail failed')
        say('Ups! No se pudo registrar tu email de Bitbucket 😢')
        return
      }

      say(`✅ Tu email de Bitbucket fue registrado correctamente: *${email}*`)
    } catch (error) {
      log.error({ err: error }, 'registerAtlassianEmail failed')
      say('Ups! Ocurrió un error al registrar tu email de Bitbucket 🤷‍♂️')
    }
  }
}
