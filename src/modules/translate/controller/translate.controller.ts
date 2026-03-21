import { createModuleLogger } from '../../../config/logger'
import GenericController from '../../../shared/modules/genericController'
import TranslateServices from '../services/translate.services'
import { SlackAuth } from '../../../shared/middleware/auth'

const log = createModuleLogger('translate.controller')

export default class TranslateController extends GenericController {
  private static instance: TranslateController

  private translateServices: TranslateServices

  private constructor() {
    super()

    this.translateServices = TranslateServices.getInstance()

    this.translate = this.translate.bind(this)
  }

  static getInstance(): TranslateController {
    if (this.instance) {
      return this.instance
    }

    this.instance = new TranslateController()
    return this.instance
  }

  @SlackAuth
  public async translate(data: any): Promise<void> {
    const { payload, say }: any = data

    try {
      const text: string = payload.text
        .replace(/^\.t(ranslate)?\s*/i, '')
        .trim()

      const firstSpaceIndex = text.indexOf(' ')
      if (firstSpaceIndex === -1) {
        say('Uso: `.translate <idioma> <texto>` o `.t <idioma> <texto>`')
        return
      }

      const targetLang = text.substring(0, firstSpaceIndex).trim()
      const textToTranslate = text.substring(firstSpaceIndex + 1).trim()

      if (!textToTranslate) {
        say('Uso: `.translate <idioma> <texto>` o `.t <idioma> <texto>`')
        return
      }

      const response = await this.translateServices.translate(textToTranslate, targetLang)

      if (response.error) {
        say(`Error: ${response.error}`)
        return
      }

      say(response.data.translatedText)
    } catch (error) {
      log.error({ err: error, slackUserId: payload?.user }, 'translate failed')
      say('Ups! Ocurrió un error al traducir. 🤷‍♂️')
    }
  }
}
