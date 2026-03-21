import { ChatCompletionRequestMessage, Configuration, OpenAIApi } from 'openai'
import { createModuleLogger } from '../../../../config/logger'
import { ITranslateRepository } from '../../shared/interfaces/translate.interfaces'

const log = createModuleLogger('openai.translate')

export default class OpenaiTranslateRepository implements ITranslateRepository {
  private static instance: OpenaiTranslateRepository

  private openai: OpenAIApi

  private constructor() {
    const configuration = new Configuration({
      apiKey: process.env.OPENAI_API_KEY,
      organization: 'org-dlzE8QUXcRrvBN096fSCdHBf',
    })

    this.openai = new OpenAIApi(configuration)
  }

  static getInstance(): OpenaiTranslateRepository {
    if (this.instance) {
      return this.instance
    }

    this.instance = new OpenaiTranslateRepository()
    return this.instance
  }

  async translate(
    text: string,
    targetLang: string,
    systemPrompt: string
  ): Promise<string | null> {
    try {
      const messages: ChatCompletionRequestMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Translate the following to ${targetLang}:\n\n${text}` },
      ]

      const completion = await this.openai.createChatCompletion({
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.2,
      })

      return completion.data.choices[0]?.message?.content ?? null
    } catch (error) {
      if (error.message?.includes('429')) {
        log.warn('OpenAI API rate limit exceeded')
      } else {
        log.error({ err: error }, 'OpenAI translate failed')
      }
      return null
    }
  }
}
