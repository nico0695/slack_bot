import { createModuleLogger } from '../../../config/logger'
import GenericController from '../../../shared/modules/genericController'
import UsersServices from '../../users/services/users.services'
import { SlackAuth } from '../../../shared/middleware/auth'
import { EMAIL_REGEX } from '../../../shared/constants/global'

const log = createModuleLogger('jira.controller')

export default class JiraController extends GenericController {
  private static instance: JiraController

  private usersServices: UsersServices

  private constructor() {
    super()
    this.usersServices = UsersServices.getInstance()
    this.registerAtlassianEmail = this.registerAtlassianEmail.bind(this)
  }

  static getInstance(): JiraController {
    if (this.instance) {
      return this.instance
    }

    this.instance = new JiraController()
    return this.instance
  }

  /**
   * Handles `.jira me <email>` — registers the atlassianEmail for the calling user.
   */
  @SlackAuth
  public async registerAtlassianEmail(data: any): Promise<void> {
    const { payload, say }: any = data

    try {
      const text: string = payload.text ?? ''
      const parts = text.trim().split(/\s+/)
      // Expected format: ".jira me <email>"
      const email = parts[2]

      if (!email || !EMAIL_REGEX.test(email)) {
        say(
          'Por favor indicá un email válido. Uso: `.jira me tu@empresa.com` 📧'
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
        say('Ups! No se pudo registrar tu email de Jira 😢')
        return
      }

      say(`✅ Tu email de Jira fue registrado correctamente: *${email}*`)
    } catch (error) {
      log.error({ err: error }, 'registerAtlassianEmail failed')
      say('Ups! Ocurrió un error al registrar tu email de Jira 🤷‍♂️')
    }
  }
}
