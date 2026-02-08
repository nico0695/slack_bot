import { ChatCompletionRequestMessage } from 'openai'
import { GoogleGenAI } from '@google/genai'
import { createModuleLogger } from '../../../../config/logger'
import { IConversation } from '../../shared/interfaces/converstions'
import { roleTypes } from '../../shared/constants/openai'
import { ConversationProviders } from '../../shared/constants/conversationFlow'

const log = createModuleLogger('gemini.conversations')

export default class GeminiRepository {
  private static instance: GeminiRepository

  private geminiApi

  private constructor() {
    this.geminiApi = this.initializeGeminiApi()

    this.chatCompletion = this.chatCompletion.bind(this)
  }

  static getInstance(): GeminiRepository {
    if (this.instance) {
      return this.instance
    }

    this.instance = new GeminiRepository()
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

  chatCompletion = async (
    messages: ChatCompletionRequestMessage[],
    options?: { mode?: 'classification' | 'default' }
  ): Promise<IConversation | null> => {
    try {
      const mode = options?.mode || 'default'
      const isClassification = mode === 'classification'

      const apiRequestBot = await this.geminiApi.models.generateContent({
        model: isClassification ? 'gemini-2.5-flash-lite' : 'gemini-2.0-flash',
        contents: messages.map((message: any) => message.content).join(' '),
      })

      const response: IConversation = {
        role: roleTypes.assistant,
        content: apiRequestBot.text,
        provider: ConversationProviders.ASSISTANT,
      }

      return response
    } catch (error) {
      if (error.message.includes('429')) {
        log.warn('Gemini API rate limit exceeded')
      } else {
        log.error({ err: error }, 'Gemini API chatCompletion failed')
      }
      return null
    }
  }
}
