import { GoogleGenAI } from '@google/genai'
import { createModuleLogger } from '../../../../config/logger'
import { ITranslateRepository } from '../../shared/interfaces/translate.interfaces'

const log = createModuleLogger('gemini.translate')

export default class GeminiTranslateRepository implements ITranslateRepository {
  private static instance: GeminiTranslateRepository

  private geminiApi

  private constructor() {
    this.geminiApi = this.initializeGeminiApi()
  }

  static getInstance(): GeminiTranslateRepository {
    if (this.instance) {
      return this.instance
    }

    this.instance = new GeminiTranslateRepository()
    return this.instance
  }

  private initializeGeminiApi(): any {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined in the environment variables.')
    }

    return new GoogleGenAI({
      apiKey,
    })
  }

  async translate(
    text: string,
    targetLang: string,
    systemPrompt: string
  ): Promise<string | null> {
    try {
      const userPrompt = `Translate the following to ${targetLang}:\n\n${text}`

      const response = await this.geminiApi.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: `${systemPrompt}\n\n${userPrompt}`,
      })

      return response.text ?? null
    } catch (error) {
      if (error.message?.includes('429')) {
        log.warn('Gemini API rate limit exceeded')
      } else {
        log.error({ err: error }, 'Gemini translate failed')
      }
      return null
    }
  }
}
