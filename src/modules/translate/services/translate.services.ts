import { createModuleLogger } from '../../../config/logger'
import { GenericResponse } from '../../../shared/interfaces/services'
import { ITranslateRepository, ITranslateResponse } from '../shared/interfaces/translate.interfaces'
import {
  TRANSLATE_SYSTEM_PROMPT,
  TranslateRepositoryType,
} from '../shared/constants/translate.constants'
import OpenaiTranslateRepository from '../repositories/openai/openaiTranslate.repository'
import GeminiTranslateRepository from '../repositories/gemini/geminiTranslate.repository'

const log = createModuleLogger('translate.services')

const TranslateRepositoryByType = {
  [TranslateRepositoryType.OPENAI]: OpenaiTranslateRepository,
  [TranslateRepositoryType.GEMINI]: GeminiTranslateRepository,
}

export default class TranslateServices {
  private static instance: TranslateServices

  private translateRepository: ITranslateRepository

  private constructor(repositoryType = TranslateRepositoryType.OPENAI) {
    this.translateRepository = TranslateRepositoryByType[repositoryType].getInstance()
  }

  static getInstance(): TranslateServices {
    if (this.instance) {
      return this.instance
    }

    this.instance = new TranslateServices()
    return this.instance
  }

  async translate(
    text: string,
    targetLang: string
  ): Promise<GenericResponse<ITranslateResponse>> {
    try {
      const translatedText = await this.translateRepository.translate(
        text,
        targetLang,
        TRANSLATE_SYSTEM_PROMPT
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
