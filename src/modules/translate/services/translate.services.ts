import { injectable, inject } from 'tsyringe'
import { createModuleLogger } from '../../../config/logger'
import { GenericResponse } from '../../../shared/interfaces/services'
import { ITranslateRepository, ITranslateResponse } from '../shared/interfaces/translate.interfaces'
import { translateSystemPrompt } from '../shared/constants/translate.constants'

const log = createModuleLogger('translate.services')

@injectable()
export default class TranslateServices {
  constructor(@inject('TranslateRepository') private translateRepository: ITranslateRepository) {}

  async translate(text: string, targetLang: string): Promise<GenericResponse<ITranslateResponse>> {
    try {
      const translatedText = await this.translateRepository.translate(
        text,
        targetLang,
        translateSystemPrompt
      )

      if (!translatedText) {
        return { error: 'No se recibió respuesta del servicio de traducción' }
      }

      log.info({ targetLang, textLength: text.length }, 'Translation completed')

      return {
        data: {
          translatedText,
          targetLang,
        },
      }
    } catch (error) {
      log.error({ err: error }, 'translate failed')
      return { error: 'Error inesperado al procesar la traducción' }
    }
  }
}
